import prettyMillisecondsCompact from "../../../transfer-visualize/utils/prettyMSFast.js";
import {promiseWithResolvers} from "../../utils/promiseWithResolvers.js";
import BaseDownloadEngineFetchStream, {
    DownloadInfoResponse,
    FetchSubState,
    MIN_LENGTH_FOR_MORE_INFO_REQUEST,
    WriteCallback
} from "./base-download-engine-fetch-stream.js";
import {EmptyStreamTimeoutError} from "./errors/EmptyStreamTimeoutError.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import StatusCodeError from "./errors/status-code-error.js";
import {browserCheck} from "./utils/browserCheck.js";
import {parseContentDisposition} from "./utils/content-disposition.js";
import {parseHttpContentRange} from "./utils/httpRange.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";

type GetNextChunk = () => Promise<ReadableStreamReadResult<Uint8Array>> | ReadableStreamReadResult<Uint8Array>;
export default class DownloadEngineFetchStreamFetch extends BaseDownloadEngineFetchStream {
    private _fetchDownloadInfoWithHEAD = false;
    private _activeController?: { signal: AbortSignal; abort: () => void; };
    public override transferAction = "Downloading";
    public override readonly supportDynamicStreamLength = true;

    withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamFetch(this.options);
        return this.cloneState(state, fetchStream) as this;
    }

    protected override async fetchWithoutRetryChunks(callback: WriteCallback) {
        const headers: { [key: string]: any; } = {
            accept: "*/*",
            ...this.options.headers
        };

        const expectedContentLength = this._endSize - this._startSize;
        if (this.state.activePart.acceptRange && expectedContentLength > 0) {
            headers.range = `bytes=${this._startSize}-${this._endSize - 1}`;
        }

        if (!this._activeController?.signal.aborted) {
            this._activeController?.abort();
        }

        const {signal, abort, clearAbortTimeout} = DownloadEngineFetchStreamFetch.timeoutAbortController(this.options.headersTimeout!);
        this._activeController = {abort, signal};
        this.on("aborted", abort);

        try {
            const response = await fetch(this.appendToURL(this.state.activePart.downloadURL), {
                headers,
                signal
            });

            clearAbortTimeout();

            if (response.status < 200 || response.status >= 300) {
                throw new StatusCodeError(this.state.activePart.downloadURL, response.status, response.statusText, headers);
            }

            const contentLength = parseHttpContentRange(response.headers.get("content-range"))?.length ?? parseInt(response.headers.get("content-length")!);
            if (this._endSize > 0 && (this.state.activePart.acceptRange && contentLength !== expectedContentLength || contentLength && contentLength < expectedContentLength)) {
                throw new InvalidContentLengthError(expectedContentLength, contentLength);
            }

            const reader = response.body!.getReader();
            return await this.chunkGenerator(callback, () => reader.read());
        } finally {
            this.off("aborted", abort);
            clearAbortTimeout();
        }
    }

    protected override async fetchDownloadInfoWithoutRetry(url: string): Promise<DownloadInfoResponse> {
        if (this._fetchDownloadInfoWithHEAD) {
            try {
                return this.fetchDownloadInfoWithoutRetryByMethod(url, "HEAD");
            } catch (error) {
                if (!(error instanceof StatusCodeError)) {
                    throw error;
                }
                this._fetchDownloadInfoWithHEAD = false;
            }
        }

        return this.fetchDownloadInfoWithoutRetryByMethod(url, "GET");
    }

    protected async fetchDownloadInfoWithoutRetryByMethod(url: string, method: "HEAD" | "GET" = "HEAD"): Promise<DownloadInfoResponse> {
        const {signal, abort, clearAbortTimeout} = DownloadEngineFetchStreamFetch.timeoutAbortController(this.options.headersTimeout!);

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    "Accept-Encoding": "identity",
                    ...this.options.headers
                },
                signal
            });

            clearAbortTimeout();

            if (response.body) {
                abort();
            }

            if (response.status < 200 || response.status >= 300) {
                throw new StatusCodeError(url, response.status, response.statusText, this.options.headers, DownloadEngineFetchStreamFetch.convertHeadersToRecord(response.headers));
            }

            const acceptRange = this.options.acceptRangeIsKnown ?? response.headers.get("accept-ranges") === "bytes";
            const fileName = parseContentDisposition(response.headers.get("content-disposition"));

            let length = parseInt(response.headers.get("content-length")!) || 0;
            const someLengthInfo = length;

            const contentEncoding = response.headers.get("content-encoding");
            if (contentEncoding && contentEncoding !== "identity") {
                length = 0; // If content is encoded, we cannot determine the length reliably
            }

            if (length === 0 && (acceptRange || browserCheck() && (method === "GET" || MIN_LENGTH_FOR_MORE_INFO_REQUEST < someLengthInfo))) {
                if (method !== "GET") {
                    return this.fetchDownloadInfoWithoutRetryByMethod(url, "GET");
                }

                const contentRange = response.headers.get("content-range");
                length = parseHttpContentRange(contentRange)?.size || 0;
            }

            return {
                length,
                acceptRange,
                newURL: response.url,
                fileName
            };
        } finally {
            clearAbortTimeout();
        }
    }

    chunkGenerator(callback: WriteCallback, getNextChunk: GetNextChunk) {
        const {promise, reject, resolve} = promiseWithResolvers<void>();

        const smartSplit = new SmartChunkSplit(callback, this.state);

        let dynamicContentLengthReached = false;
        let waitingForChunk = false;
        let waitStartedAt = Date.now();
        let streamNotRespondedInTime = false;
        let lastReadTime = 0;
        let finished = false;

        const clearStreamNotResponding = () => {
            if (!streamNotRespondedInTime) return;
            streamNotRespondedInTime = false;
            this.emit0("streamNotRespondingOff");
        };

        const watchDogCallback = () => {
            if (this.paused) {
                clearWatchdog();
                smartSplit.closeAndSendLeftoversIfLengthIsUnknown();
                this._activeController?.abort();
                this.paused.then(resolve);
                return;
            }

            readData();

            if (!waitingForChunk || finished) {
                return;
            }

            const waitTime = Date.now() - waitStartedAt;
            if (!streamNotRespondedInTime && waitTime >= this.options.streamWaitAlert!) {
                streamNotRespondedInTime = true;
                this.emit0("streamNotRespondingOn");
            }

            if (waitTime >= this.options.maxStreamWait!) {
                onFinish(new EmptyStreamTimeoutError(`Stream timeout after ${prettyMillisecondsCompact(this.options.maxStreamWait!)}`));
                this._activeController?.abort();
            }
        };

        const clearWatchdog = this.watchDog(watchDogCallback);

        const onFinish = (error?: Error) => {
            if (finished) return;

            finished = true;
            waitingForChunk = false;
            clearStreamNotResponding();
            clearWatchdog();
            smartSplit.closeAndSendLeftoversIfLengthIsUnknown();

            if (error && !this.aborted) {
                reject(error);
            } else {
                resolve();
            }
        };

        const readData = async () => {
            if (finished || waitingForChunk || Date.now() - lastReadTime < this.options.progressThrottleMs!) {
                return;
            }

            try {
                if (this.aborted) {
                    onFinish();
                    return;
                }

                waitingForChunk = true;
                waitStartedAt = Date.now();
                const chunkInfo = await getNextChunk();
                waitingForChunk = false;
                clearStreamNotResponding();
                lastReadTime = Date.now();

                if (!chunkInfo || this.aborted || chunkInfo.done) {
                    onFinish();
                    return;
                }

                let value = chunkInfo.value;
                this.noRangeFetchSize += chunkInfo.value.length;

                if (!this.state.activePart.acceptRange && this._startSize > 0) {
                    if (!dynamicContentLengthReached) {
                        if (this._startSize > this.noRangeFetchSize) {
                            this.state.onProgress?.(this.noRangeFetchSize);
                            return;
                        }

                        const skipBytes = chunkInfo.value.length - (this.noRangeFetchSize - this._startSize);
                        value = chunkInfo.value.subarray(skipBytes);

                        dynamicContentLengthReached = true;
                    }
                }

                smartSplit.addChunk(value);
                this.state.onProgress?.(smartSplit.savedLength);

                if (dynamicContentLengthReached && this._endSize && this.noRangeFetchSize >= this._endSize) {
                    this._activeController?.abort();
                    onFinish();
                    return;
                }
            } catch (error) {
                onFinish(error as any);
            }
        };

        return promise;
    }


    protected static convertHeadersToRecord(headers: Headers): { [key: string]: string; } {
        const headerObj: { [key: string]: string; } = {};
        headers.forEach((value, key) => {
            headerObj[key] = value;
        });
        return headerObj;
    }

}
