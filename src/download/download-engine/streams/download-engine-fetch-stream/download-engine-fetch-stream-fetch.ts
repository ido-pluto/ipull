import BaseDownloadEngineFetchStream, {DownloadInfoResponse, FetchSubState, MIN_LENGTH_FOR_MORE_INFO_REQUEST, WriteCallback} from "./base-download-engine-fetch-stream.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";
import {parseContentDisposition} from "./utils/content-disposition.js";
import StatusCodeError from "./errors/status-code-error.js";
import {parseHttpContentRange} from "./utils/httpRange.js";
import {browserCheck} from "./utils/browserCheck.js";
import {EmptyStreamTimeoutError} from "./errors/EmptyStreamTimeoutError.js";
import prettyMilliseconds from "pretty-ms";

type GetNextChunk = () => Promise<ReadableStreamReadResult<Uint8Array>> | ReadableStreamReadResult<Uint8Array>;
export default class DownloadEngineFetchStreamFetch extends BaseDownloadEngineFetchStream {
    private _fetchDownloadInfoWithHEAD = false;
    public override transferAction = "Downloading";
    public override readonly supportDynamicStreamLength = true;

    withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamFetch(this.options);
        return this.cloneState(state, fetchStream) as this;
    }

    protected override async fetchWithoutRetryChunks(callback: WriteCallback) {
        const headers: { [key: string]: any } = {
            accept: "*/*",
            ...this.options.headers
        };

        if (this.state.rangeSupport) {
            headers.range = `bytes=${this._startSize}-${this._endSize - 1}`;
        }

        const controller = new AbortController();
        const response = await fetch(this.appendToURL(this.state.url), {
            headers,
            signal: controller.signal
        });

        if (response.status < 200 || response.status >= 300) {
            throw new StatusCodeError(this.state.url, response.status, response.statusText, headers);
        }

        const contentLength = parseHttpContentRange(response.headers.get("content-range"))?.length ?? parseInt(response.headers.get("content-length")!);
        const expectedContentLength = this._endSize - this._startSize;
        if (this.state.rangeSupport && contentLength !== expectedContentLength) {
            throw new InvalidContentLengthError(expectedContentLength, contentLength);
        }

        this.on("aborted", () => {
            controller.abort();
        });

        const reader = response.body!.getReader();
        return await this.chunkGenerator(callback, () => reader.read());
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
        const response = await fetch(url, {
            method: method,
            headers: {
                "Accept-Encoding": "identity",
                ...this.options.headers
            }
        });


        if (response.status < 200 || response.status >= 300) {
            throw new StatusCodeError(url, response.status, response.statusText, this.options.headers, DownloadEngineFetchStreamFetch.convertHeadersToRecord(response.headers));
        }

        const acceptRange = this.options.acceptRangeIsKnown ?? response.headers.get("accept-ranges") === "bytes";
        const fileName = parseContentDisposition(response.headers.get("content-disposition"));

        let length = parseInt(response.headers.get("content-length")!) || 0;
        if (response.headers.get("content-encoding") || browserCheck() && MIN_LENGTH_FOR_MORE_INFO_REQUEST < length) {
            length = acceptRange ? await this.fetchDownloadInfoWithoutRetryContentRange(url, method === "GET" ? response : undefined) : 0;
        }

        return {
            length,
            acceptRange,
            newURL: response.url,
            fileName
        };
    }

    protected async fetchDownloadInfoWithoutRetryContentRange(url: string, response?: Response) {
        const responseGet = response ?? await fetch(url, {
            method: "GET",
            headers: {
                accept: "*/*",
                ...this.options.headers,
                range: "bytes=0-0"
            }
        });

        const contentRange = responseGet.headers.get("content-range");
        return parseHttpContentRange(contentRange)?.size || 0;
    }

    async chunkGenerator(callback: WriteCallback, getNextChunk: GetNextChunk) {
        const smartSplit = new SmartChunkSplit(callback, this.state);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const {done, value} = await DownloadEngineFetchStreamFetch._wrapperStreamTimeout(getNextChunk());
            await this.paused;
            if (done || this.aborted) break;

            smartSplit.addChunk(value);
            this.state.onProgress?.(smartSplit.savedLength);
        }

        smartSplit.sendLeftovers();
    }

    protected static convertHeadersToRecord(headers: Headers): { [key: string]: string } {
        const headerObj: { [key: string]: string } = {};
        headers.forEach((value, key) => {
            headerObj[key] = value;
        });
        return headerObj;
    }

    protected static _wrapperStreamTimeout<T>(promise: Promise<T> | T, maxStreamWait = 2_000): Promise<T> | T {
        if (!(promise instanceof Promise)) {
            return promise;
        }

        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new EmptyStreamTimeoutError(`Stream timeout after ${prettyMilliseconds(maxStreamWait)}`));
            }, maxStreamWait);

            promise.then(
                (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            );
        });
    }
}
