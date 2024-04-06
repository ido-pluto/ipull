import BaseDownloadEngineFetchStream, {DownloadInfoResponse, FetchSubState, WriteCallback} from "./base-download-engine-fetch-stream.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";
import {parseContentDisposition} from "./utils/content-disposition.js";
import StatusCodeError from "./errors/status-code-error.js";

type GetNextChunk = () => Promise<ReadableStreamReadResult<Uint8Array>> | ReadableStreamReadResult<Uint8Array>;
export default class DownloadEngineFetchStreamFetch extends BaseDownloadEngineFetchStream {
    public override transferAction = "Downloading";

    withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamFetch(this.options);
        return this.cloneState(state, fetchStream) as this;
    }

    protected override async fetchWithoutRetryChunks(callback: WriteCallback) {
        const headers = {
            accept: "*/*",
            ...this.options.headers,
            range: `bytes=${this._startSize}-${this._endSize - 1}`
        };

        const controller = new AbortController();
        const response = await fetch(this.appendToURL(this.state.url), {
            headers,
            signal: controller.signal
        });

        if (response.status < 200 || response.status >= 300) {
            throw new StatusCodeError(this.state.url, response.status, response.statusText, headers);
        }

        const contentLength = parseInt(response.headers.get("content-length")!);
        const expectedContentLength = this._endSize - this._startSize;
        if (contentLength !== expectedContentLength) {
            throw new InvalidContentLengthError(expectedContentLength, contentLength);
        }

        this.on("aborted", () => {
            controller.abort();
        });

        const reader = response.body!.getReader();
        return await this.chunkGenerator(callback, () => reader.read());
    }

    protected override async fetchDownloadInfoWithoutRetry(url: string): Promise<DownloadInfoResponse> {
        const response = await fetch(url, {
            method: "HEAD",
            headers: this.options.headers
        });

        if (response.status < 200 || response.status >= 300) {
            throw new StatusCodeError(url, response.status, response.statusText, this.options.headers);
        }

        const length = parseInt(response.headers.get("content-length")!);
        const acceptRange = this.options.acceptRangeIsKnown ?? response.headers.get("accept-ranges") === "bytes";
        const fileName = parseContentDisposition(response.headers.get("content-disposition"));

        return {
            length,
            acceptRange,
            newURL: response.url,
            fileName
        };
    }

    async chunkGenerator(callback: WriteCallback, getNextChunk: GetNextChunk) {
        const smartSplit = new SmartChunkSplit(callback, this.state);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const {done, value} = await getNextChunk();
            await this.paused;
            if (done || this.aborted) break;

            smartSplit.addChunk(value);
            this.state.onProgress?.(smartSplit.savedLength);
        }

        smartSplit.sendLeftovers();
    }
}
