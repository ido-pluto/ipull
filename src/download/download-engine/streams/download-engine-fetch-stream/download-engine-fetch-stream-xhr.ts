import retry from "async-retry";
import prettyMillisecondsCompact from "../../../transfer-visualize/utils/prettyMSFast.js";
import {AvailablePrograms} from "../../download-file/download-programs/switch-program.js";
import BaseDownloadEngineFetchStream, {
    BaseDownloadEngineFetchStreamOptions,
    DownloadInfoResponse,
    FetchSubState,
    MIN_LENGTH_FOR_MORE_INFO_REQUEST,
    WriteCallback
} from "./base-download-engine-fetch-stream.js";
import EmptyResponseError from "./errors/empty-response-error.js";
import {EmptyStreamTimeoutError} from "./errors/EmptyStreamTimeoutError.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import StatusCodeError from "./errors/status-code-error.js";
import XhrError from "./errors/xhr-error.js";
import {parseContentDisposition} from "./utils/content-disposition.js";
import {parseHttpContentRange} from "./utils/httpRange.js";

const DEFAULT_OPTIONS: Partial<BaseDownloadEngineFetchStreamOptions> = {
    streamCheckInterval: 1000
};

export default class DownloadEngineFetchStreamXhr extends BaseDownloadEngineFetchStream {
    private _fetchDownloadInfoWithHEAD = true;
    public override readonly defaultProgramType: AvailablePrograms = "chunks";
    public override readonly availablePrograms: AvailablePrograms[] = ["chunks"];

    public override transferAction = "Downloading";

    constructor(options: Partial<BaseDownloadEngineFetchStreamOptions> = {}) {
        super({
            ...DEFAULT_OPTIONS,
            ...options
        });
    }

    withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamXhr(this.options);
        return this.cloneState(state, fetchStream) as this;
    }

    public async fetchBytes(url: string, start: number, end: number, onProgress?: (length: number) => void) {
        return await retry(async () => {
            return await this.fetchBytesWithoutRetry(url, start, end, onProgress);
        }, this.options.retry);
    }

    protected fetchBytesWithoutRetry(url: string, start: number, end: number, onProgress?: (length: number) => void): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            const headers: { [key: string]: any; } = {
                accept: "*/*",
                ...this.options.headers
            };

            const expectedContentLength = end - start;
            if (this.state.activePart.acceptRange && expectedContentLength > 0) {
                headers.range = `bytes=${start}-${end - 1}`;
            }

            const {signal, clearAbortTimeout} = DownloadEngineFetchStreamXhr.timeoutAbortController(this.options.headersTimeout!);

            const xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";
            xhr.open("GET", this.appendToURL(url), true);
            for (const [key, value] of Object.entries(headers)) {
                xhr.setRequestHeader(key, value);
            }

            let streamNotRespondedInTime = false;
            let waitingForChunk = false;
            let lastChunkReceived = 0;
            let aborted = false;

            const clearStreamNotResponding = () => {
                lastChunkReceived = Date.now();
                waitingForChunk = false;
                if (streamNotRespondedInTime) {
                    streamNotRespondedInTime = false;
                    this.emit0("streamNotRespondingOff");
                }
            };

            const clearWatchDog = this.watchDog(() => {
                if (!waitingForChunk || aborted) {
                    return;
                }

                const waitTime = Date.now() - lastChunkReceived;
                if (!streamNotRespondedInTime && waitTime >= this.options.streamWaitAlert!) {
                    streamNotRespondedInTime = true;
                    this.emit0("streamNotRespondingOn");
                }

                if (waitTime >= this.options.maxStreamWait!) {
                    abortXhr(new EmptyStreamTimeoutError(`Stream timeout after ${prettyMillisecondsCompact(this.options.maxStreamWait!)}`));
                }
            });

            const abortXhr = (throwError = new XhrError(`Aborted fetching ${url}`)) => {
                aborted = true;
                clearAbortTimeout();
                xhr.abort();
                this.off("aborted", abortXhr);
                clearStreamNotResponding();
                clearWatchDog();

                reject(throwError);
            };

            xhr.onload = () => {
                clearStreamNotResponding();
                clearWatchDog();

                if (xhr.status >= 200 && xhr.status < 300) {
                    const arrayBuffer: ArrayBuffer = xhr.response;
                    if (arrayBuffer) {
                        if (this._endSize > 0) {
                            if (this.state.activePart.acceptRange) {
                                if (expectedContentLength != arrayBuffer.byteLength) {
                                    return reject(new InvalidContentLengthError(expectedContentLength, arrayBuffer.byteLength));
                                }
                            } else if (arrayBuffer.byteLength < expectedContentLength) {
                                return reject(new InvalidContentLengthError(expectedContentLength, arrayBuffer.byteLength));
                            } else {
                                const newExpectedContentLength = this._endSize - start; // recalculate expected content length in case it was changed since the request was sent (e.g. due to retries with different range)
                                return resolve(new Uint8Array(arrayBuffer, start, Math.min(arrayBuffer.byteLength - start, newExpectedContentLength)));
                            }
                        }

                        resolve(new Uint8Array(arrayBuffer));
                    } else {
                        reject(new EmptyResponseError(url, headers));
                    }
                } else {
                    reject(new StatusCodeError(url, xhr.status, xhr.statusText, headers));
                }
            };

            xhr.onerror = () => {
                abortXhr(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.onprogress = (event) => {
                clearStreamNotResponding();
                if (event.lengthComputable) {
                    onProgress?.(event.loaded);
                    this.noRangeFetchSize = event.loaded;
                }
            };

            xhr.onreadystatechange = () => {
                if (xhr.readyState != XMLHttpRequest.HEADERS_RECEIVED) {
                    return;
                }

                clearAbortTimeout();
                waitingForChunk = true;

                const contentLength = parseHttpContentRange(xhr.getResponseHeader("content-range"))?.length ?? parseInt(xhr.getResponseHeader("content-length")!);
                if (this.state.activePart.acceptRange && contentLength !== expectedContentLength || contentLength && expectedContentLength && contentLength < expectedContentLength) {
                    abortXhr(new InvalidContentLengthError(expectedContentLength, contentLength));
                }
            };

            xhr.onloadend = () => {
                this.off("aborted", abortXhr);
            };

            xhr.send();
            this.on("aborted", abortXhr);
            signal.addEventListener("abort", () => {
                abortXhr(new XhrError(signal.reason));
            });
        });
    }

    public override async fetchChunks(callback: WriteCallback) {
        if (this.state.activePart.acceptRange) {
            return await this._fetchChunksRangeSupport(callback);
        }

        return await this._fetchChunksWithoutRange(callback);
    }

    protected override fetchWithoutRetryChunks(): Promise<void> {
        throw new Error("Method not needed, use fetchChunks instead.");
    }

    protected async _fetchChunksRangeSupport(callback: WriteCallback) {
        while (this._startSize < this._endSize) {
            await this.paused;
            if (this.aborted) return;

            const chunk = await this.fetchBytes(this.state.activePart.downloadURL, this._startSize, this._endSize, this.state.onProgress);
            callback([chunk], this._startSize, this.state.startChunk++, chunk.length);
        }
    }

    protected async _fetchChunksWithoutRange(callback: WriteCallback) {
        const relevantContent = await (async (): Promise<Uint8Array> => {
            const result = await this.fetchBytes(this.state.activePart.downloadURL, 0, this._endSize, this.state.onProgress);
            return result.slice(this._startSize, this._endSize || result.length);
        })();

        let totalReceivedLength = 0;

        let index = 0;
        while (totalReceivedLength < relevantContent.byteLength) {
            await this.paused;
            if (this.aborted) return;
            const start = totalReceivedLength;
            const end = Math.min(relevantContent.byteLength, start + this.state.chunkSize);

            const chunk = relevantContent.slice(start, end);
            totalReceivedLength += chunk.byteLength;
            callback([chunk], index * this.state.chunkSize, index++, chunk.length);
        }
    }

    protected override fetchDownloadInfoWithoutRetry(url: string): Promise<DownloadInfoResponse> {
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
        return new Promise((resolve, reject) => {
            const {signal, abort, clearAbortTimeout} = DownloadEngineFetchStreamXhr.timeoutAbortController(this.options.headersTimeout!);

            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);

            signal.addEventListener("abort", () => {
                reject(new XhrError(signal.reason));
                xhr.abort();
            });

            const abortXhr = () => {
                abort();
                this.off("aborted", abortXhr);
            };

            this.on("aborted", abortXhr);

            const allHeaders = {
                ...this.options.headers
            };
            for (const [key, value] of Object.entries(allHeaders)) {
                xhr.setRequestHeader(key, value);
            }

            xhr.onreadystatechange = () => {
                if (xhr.readyState != XMLHttpRequest.HEADERS_RECEIVED) {
                    return;
                }

                this.off("aborted", abortXhr);

                if (method != "HEAD") {
                    xhr.abort();
                }

                clearAbortTimeout();

                if (xhr.status >= 200 && xhr.status < 300) {
                    const fileName = parseContentDisposition(xhr.getResponseHeader("content-disposition"));
                    const acceptRange = this.options.acceptRangeIsKnown ?? xhr.getResponseHeader("Accept-Ranges") === "bytes";
                    const contentEncoding = xhr.getResponseHeader("content-encoding");

                    let length = parseInt(xhr.getResponseHeader("content-length")!) || 0;
                    const someLengthInfo = length;

                    if (contentEncoding && contentEncoding !== "identity") {
                        length = 0; // If content is encoded, we cannot determine the length reliably
                    }

                    if (length === 0 && (acceptRange || method === "GET" || MIN_LENGTH_FOR_MORE_INFO_REQUEST < someLengthInfo)) {
                        if (method !== "GET") {
                            resolve(this.fetchDownloadInfoWithoutRetryByMethod(url, "GET"));
                            return;
                        }

                        const contentRange = xhr.getResponseHeader("Content-Range");
                        length = parseHttpContentRange(contentRange)?.size || 0;
                    }

                    resolve({
                        acceptRange,
                        length,
                        newURL: xhr.responseURL,
                        fileName
                    });
                } else {
                    reject(new StatusCodeError(url, xhr.status, xhr.statusText, this.options.headers, DownloadEngineFetchStreamXhr.convertXHRHeadersToRecord(xhr)));
                }
            };

            xhr.onerror = () => {
                this.off("aborted", abortXhr);
                reject(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.send();
        });

    }

    protected static convertXHRHeadersToRecord(xhr: XMLHttpRequest): Record<string, string> {
        const headersString = xhr.getAllResponseHeaders();
        const headersArray = headersString.trim()
            .split(/[\r\n]+/);
        const headersObject: { [key: string]: string; } = {};

        headersArray.forEach(line => {
            const parts = line.split(": ");
            const key = parts.shift();
            const value = parts.join(": ");
            if (key) {
                headersObject[key] = value;
            }
        });

        return headersObject;
    }
}
