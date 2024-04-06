import BaseDownloadEngineFetchStream, {DownloadInfoResponse, FetchSubState, WriteCallback} from "./base-download-engine-fetch-stream.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";
import {parseContentDisposition} from "./utils/content-disposition.js";

type GetNextChunk = () => Promise<ReadableStreamReadResult<Uint8Array>> | ReadableStreamReadResult<Uint8Array>;
export default class DownloadEngineFetchStreamFetch extends BaseDownloadEngineFetchStream {
    public override transferAction = "Downloading";

    withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamFetch(this.options);
        return this.cloneState(state, fetchStream) as this;
    }

    protected override async fetchWithoutRetryChunks(callback: WriteCallback) {
        const controller = new AbortController();
        const response = await fetch(this.appendToURL(this.state.url), {
            headers: {
                accept: "*/*",
                ...this.options.headers,
                range: `bytes=${this._startSize}-${this._endSize - 1}`
            },
            signal: controller.signal
        });

        this.on("aborted", () => {
            controller.abort();
        });

        const contentLength = parseInt(response.headers.get("content-length")!);
        const expectedContentLength = this._endSize - this._startSize;
        if (contentLength !== expectedContentLength) {
            throw new InvalidContentLengthError(expectedContentLength, contentLength);
        }

        const reader = response.body!.getReader();
        return await this.chunkGenerator(callback, () => reader.read());
    }

    protected override async fetchDownloadInfoWithoutRetry(url: string): Promise<DownloadInfoResponse> {
        const response = await fetch(url, {
            method: "HEAD",
            headers: this.options.headers
        });

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
