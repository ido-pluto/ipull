import BaseDownloadEngineFetchStream, {FetchSubState, WriteCallback} from "./base-download-engine-fetch-stream.js";
import EmptyResponseError from "./errors/empty-response-error.js";
import StatusCodeError from "./errors/status-code-error.js";
import XhrError from "./errors/xhr-error.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import retry from "async-retry";


export default class DownloadEngineFetchStreamXhr extends BaseDownloadEngineFetchStream {
    public override transferAction = "Downloading";

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
            const headers = {
                accept: "*/*",
                ...this.options.headers,
                range: `bytes=${start}-${end - 1}` // get the range up to end-1. Length 2: 0-1
            };

            const xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";
            xhr.open("GET", this.appendToURL(url), true);
            for (const [key, value] of Object.entries(headers)) {
                xhr.setRequestHeader(key, value);
            }

            xhr.onload = function () {
                const contentLength = parseInt(xhr.getResponseHeader("content-length")!);
                if (contentLength !== end - start) {
                    throw new InvalidContentLengthError(end - start, contentLength);
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    const arrayBuffer = xhr.response;
                    if (arrayBuffer) {
                        const uint8Array = new Uint8Array(arrayBuffer);
                        resolve(uint8Array);
                    } else {
                        reject(new EmptyResponseError(url, headers));
                    }
                } else {
                    reject(new StatusCodeError(url, xhr.status, xhr.statusText, headers));
                }
            };

            xhr.onerror = function () {
                reject(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.onprogress = function (event) {
                if (event.lengthComputable) {
                    onProgress?.(event.loaded);
                }
            };

            xhr.send();

            this.on("aborted", () => {
                xhr.abort();
            });
        });
    }

    public override async fetchChunks(callback: WriteCallback) {
        if (this.state.rangeSupport) {
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

            const chunk = await this.fetchBytes(this.state.url, this._startSize, this._endSize, this.state.onProgress);
            callback([chunk], this._startSize, this.state.startChunk++);
        }
    }

    protected async _fetchChunksWithoutRange(callback: WriteCallback) {
        const relevantContent = await (async (): Promise<Uint8Array> => {
            const result = await this.fetchBytes(this.state.url, 0, this._endSize, this.state.onProgress);
            return result.slice(this._startSize, this._endSize);
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
            callback([chunk], index * this.state.chunkSize, index++);
        }
    }

    protected override fetchDownloadInfoWithoutRetry(url: string): Promise<{ length: number; acceptRange: boolean; }> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, true);
            for (const [key, value] of Object.entries(this.options.headers ??= {})) {
                xhr.setRequestHeader(key, value);
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const length = xhr.getResponseHeader("Content-Length") || "-";
                    const acceptRange = this.options.acceptRangeIsKnown ?? xhr.getResponseHeader("Accept-Ranges") === "bytes";
                    resolve({length: parseInt(length), acceptRange});
                } else {
                    reject(new StatusCodeError(url, xhr.status, xhr.statusText, this.options.headers));
                }
            };

            xhr.onerror = function () {
                reject(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.send();
        });
    }

}
