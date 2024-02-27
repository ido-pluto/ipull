import BaseDownloadEngineFetchStream from "./base-download-engine-fetch-stream.js";
import InvalidContentLengthError from "./errors/invalid-content-length-error.js";

export default class DownloadEngineFetchStreamFetch extends BaseDownloadEngineFetchStream {
    protected async fetchBytesWithoutRetry(url: string, start: number, end: number, onProgress?: (length: number) => void) {
        const response = await fetch(this._appendToURL(url), {
            headers: {
                accept: "*/*",
                ...this.options.headers,
                range: `bytes=${start}-${end - 1}` // get the range up to end-1. Length 2: 0-1
            }
        });

        const contentLength = parseInt(response.headers.get("content-length")!);
        if (contentLength !== end - start) {
            throw new InvalidContentLengthError(end - start, contentLength);
        }

        let receivedLength = 0;
        const reader = response.body!.getReader();
        const chunks = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;

            receivedLength += value.length;
            chunks.push(value);
            onProgress?.(receivedLength);
        }

        const arrayBuffer = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
            arrayBuffer.set(chunk, position);
            position += chunk.length;
        }

        return arrayBuffer;
    }

    protected async fetchDownloadInfoWithoutRetry(url: string): Promise<{ length: number; acceptRange: boolean }> {
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
}
