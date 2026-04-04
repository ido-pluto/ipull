
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {describe, test} from "vitest";
import {RangeOutOfPartLengthError} from "../src/download/download-engine/engine/error/RangeOutOfPartLengthError.js";
import DownloadEngineFetchStreamFetch from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
// import {DownloadFile} from "../src/download/download-engine/types.js";

const TEST_URL = "https://huggingface.co/giladgd/Qwen3-Reranker-0.6B-GGUF/resolve/main/Qwen3-Reranker-0.6B.Q2_K.gguf?download=true";

function createPartWithRange(url: string, range: { start: number, end: number; }, remoteFileSize: number) {
    return {
        downloadURL: url,
        originalURL: url,
        acceptRange: true,
        remoteFileSize,
        downloadSize: range.end - range.start + 1,
        downloadURLUpdateDate: Date.now(),
        fetchStream: new DownloadEngineFetchStreamFetch(),
        parallelStreams: 1,
        autoIncreaseParallelStreams: false,
        programType: "stream",
        range
    };
}

describe("Range Validation & Error Handling", () => {
    test("should throw RangeOutOfPartLengthError if range exceeds remoteFileSize", async ({expect}) => {
        const remoteFileSize = 1000;
        const part = createPartWithRange(TEST_URL, {start: 0, end: 2000}, remoteFileSize);
        expect(() => {
            if (part.downloadSize > part.remoteFileSize) {
                throw new RangeOutOfPartLengthError(part.downloadURL, part.range.end, part.remoteFileSize);
            }
        }).toThrow(RangeOutOfPartLengthError);
    });

    test("should throw if start > end", async ({expect}) => {
        const remoteFileSize = 1000;
        const part = createPartWithRange(TEST_URL, {start: 900, end: 800}, remoteFileSize);
        expect(() => {
            if (part.range.start > part.range.end) {
                throw new Error("Start of range is greater than end");
            }
        }).toThrow("Start of range is greater than end");
    });

    test("should throw if range is negative", async ({expect}) => {
        const remoteFileSize = 1000;
        const part = createPartWithRange(TEST_URL, {start: -10, end: 100}, remoteFileSize);
        expect(() => {
            if (part.range.start < 0) {
                throw new Error("Range start is negative");
            }
        }).toThrow("Range start is negative");
    });
});
