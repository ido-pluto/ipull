import BaseDownloadEngineFetchStream, {DownloadInfoResponse, FetchSubState, MIN_LENGTH_FOR_MORE_INFO_REQUEST, WriteCallback} from "./base-download-engine-fetch-stream.js";
import EmptyResponseError from "./errors/empty-response-error.js";
import StatusCodeError from "./errors/status-code-error.js";
import XhrError from "./errors/xhr-error.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import retry from "async-retry";
import {AvailablePrograms} from "../../download-file/download-programs/switch-program.js";
import {parseContentDisposition} from "./utils/content-disposition.js";
import {parseHttpContentRange} from "./utils/httpRange.js";
import {EmptyStreamTimeoutError} from "./errors/EmptyStreamTimeoutError.js";
import prettyMilliseconds from "pretty-ms";


export default class DownloadEngineFetchStreamXhr extends BaseDownloadEngineFetchStream {
    private _fetchDownloadInfoWithHEAD = true;
    public override readonly defaultProgramType: AvailablePrograms = "chunks";
    public override readonly availablePrograms: AvailablePrograms[] = ["chunks"];

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
            const headers: { [key: string]: any } = {
                accept: "*/*",
                ...this.options.headers
            };

            if (this.state.rangeSupport) {
                headers.range = `bytes=${start}-${end - 1}`;
            }

            const xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";
            xhr.open("GET", this.appendToURL(url), true);
            for (const [key, value] of Object.entries(headers)) {
                xhr.setRequestHeader(key, value);
            }

            let lastTimeoutIndex: any;
            const clearStreamTimeout = () => {
                if (lastTimeoutIndex) {
                    clearTimeout(lastTimeoutIndex);
                }
            };

            const createStreamTimeout = () => {
                clearStreamTimeout();
                lastTimeoutIndex = setTimeout(() => {
                    reject(new EmptyStreamTimeoutError(`Stream timeout after ${prettyMilliseconds(this.options.maxStreamWait!)}`));
                    xhr.abort();
                }, this.options.maxStreamWait);
            };


            xhr.onload = () => {
                clearStreamTimeout();
                const contentLength = parseInt(xhr.getResponseHeader("content-length")!);

                if (this.state.rangeSupport && contentLength !== end - start) {
                    throw new InvalidContentLengthError(end - start, contentLength);
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    const arrayBuffer = xhr.response;
                    if (arrayBuffer) {
                        resolve(new Uint8Array(arrayBuffer));
                    } else {
                        reject(new EmptyResponseError(url, headers));
                    }
                } else {
                    reject(new StatusCodeError(url, xhr.status, xhr.statusText, headers));
                }
            };

            xhr.onerror = () => {
                clearStreamTimeout();
                reject(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.onprogress = (event) => {
                createStreamTimeout();
                if (event.lengthComputable) {
                    onProgress?.(event.loaded);
                }
            };

            xhr.send();
            createStreamTimeout();

            this.on("aborted", () => {
                clearStreamTimeout();
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
            callback([chunk], index * this.state.chunkSize, index++);
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
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);

            const allHeaders = {
                ...this.options.headers
            };
            for (const [key, value] of Object.entries(allHeaders)) {
                xhr.setRequestHeader(key, value);
            }

            xhr.onload = async () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const contentLength = parseInt(xhr.getResponseHeader("content-length")!);
                    const length = MIN_LENGTH_FOR_MORE_INFO_REQUEST < contentLength ? await this.fetchDownloadInfoWithoutRetryContentRange(url, method === "GET" ? xhr : undefined) : 0;
                    const fileName = parseContentDisposition(xhr.getResponseHeader("content-disposition"));
                    const acceptRange = this.options.acceptRangeIsKnown ?? xhr.getResponseHeader("Accept-Ranges") === "bytes";

                    resolve({
                        length,
                        acceptRange,
                        newURL: xhr.responseURL,
                        fileName
                    });
                } else {
                    reject(new StatusCodeError(url, xhr.status, xhr.statusText, this.options.headers, DownloadEngineFetchStreamXhr.convertXHRHeadersToRecord(xhr)));
                }
            };

            xhr.onerror = function () {
                reject(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.send();
        });

    }

    protected fetchDownloadInfoWithoutRetryContentRange(url: string, xhrResponse?: XMLHttpRequest) {
        const getSize = (xhr: XMLHttpRequest) => {
            const contentRange = xhr.getResponseHeader("Content-Range");
            return parseHttpContentRange(contentRange)?.size || 0;
        };

        if (xhrResponse) {
            return getSize(xhrResponse);
        }

        return new Promise<number>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);

            const allHeaders = {
                accept: "*/*",
                ...this.options.headers,
                range: "bytes=0-0"
            };
            for (const [key, value] of Object.entries(allHeaders)) {
                xhr.setRequestHeader(key, value);
            }

            xhr.onload = () => {
                resolve(getSize(xhr));
            };

            xhr.onerror = () => {
                reject(new XhrError(`Failed to fetch ${url}`));
            };

            xhr.send();
        });
    }

    protected static convertXHRHeadersToRecord(xhr: XMLHttpRequest): Record<string, string> {
        const headersString = xhr.getAllResponseHeaders();
        const headersArray = headersString.trim()
            .split(/[\r\n]+/);
        const headersObject: { [key: string]: string } = {};

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
