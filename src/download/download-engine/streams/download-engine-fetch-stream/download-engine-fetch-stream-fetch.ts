import BaseDownloadEngineFetchStream, {FetchSubState} from "./base-download-engine-fetch-stream.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";
import FetchStreamError from "./errors/fetch-stream-error.js";
import {promiseWithResolvers} from "./utils/retry-async-statement.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";

type GetNextChunk = () => Promise<ReadableStreamReadResult<Uint8Array>> | ReadableStreamReadResult<Uint8Array>;
export default class DownloadEngineFetchStreamFetch extends BaseDownloadEngineFetchStream {
    public override transferAction = "Downloading";

    withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamFetch(this.options);
        fetchStream.state = state;

        return fetchStream as this;
    }

    protected override async fetchBytesWithoutRetry(url: string, start: number, end: number, onProgress?: ((length: number) => void) | undefined): Promise<Uint8Array> {
        const {promise, resolve, reject} = promiseWithResolvers<Uint8Array>();
        await this.withSubState({url, start, end, onProgress, chunkSize: end - start, rangeSupport: true})
            .fetchWithoutRetryChunks(resolve);
        reject(new FetchStreamError("No chunks received"));

        return await promise;
    }

    protected override async fetchWithoutRetryChunks(callback: (data: Uint8Array, index: number) => void) {
        const response = await fetch(this.appendToURL(this.state.url), {
            headers: {
                accept: "*/*",
                ...this.options.headers,
                range: `bytes=${this.state.start}-${this.state.end! - 1}`
            }
        });

        const contentLength = parseInt(response.headers.get("content-length")!);
        const expectedContentLength = this.state.end - this.state.start;
        if (contentLength !== expectedContentLength) {
            throw new InvalidContentLengthError(expectedContentLength, contentLength);
        }

        const reader = response.body!.getReader();

        return await this.chunkGenerator(callback, () => reader.read());
    }

    protected override async fetchDownloadInfoWithoutRetry(url: string): Promise<{ length: number; acceptRange: boolean; }> {
        const response = await fetch(url, {
            method: "HEAD",
            ...this.options.headers
        });

        const length = parseInt(response.headers.get("content-length")!);
        const acceptRange = this.options.acceptRangeIsKnown ?? response.headers.get("accept-ranges") === "bytes";

        return {
            length,
            acceptRange
        };
    }

    async chunkGenerator(callback: (data: Uint8Array, index: number) => void, getNextChunk: GetNextChunk) {
        const smartSplit = new SmartChunkSplit(callback, this.state);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const {done, value} = await getNextChunk();
            await this.paused;
            if (done || this.aborted) break;

            smartSplit.addChunk(value);
            this.state.onProgress?.(smartSplit.leftOverLength);
        }

        smartSplit.sendLeftovers();
    }
}
