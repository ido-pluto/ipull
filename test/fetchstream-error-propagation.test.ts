import {describe, test} from "vitest";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import {DownloadFile} from "../src/download/download-engine/types.js";

class FailingFetchStream {
    aborted = false;
    paused = false;
    availablePrograms = ["stream", "chunks"];
    defaultProgramType = "stream";
    on() { }
    emit() { }
    close() {
        this.aborted = true;
    }
    withSubState() {
        return {
            addListener: () => { },
            chunkSize: 10,
            startChunk: 0,
            endChunk: 1,
            lastChunkEndsFile: true,
            activePart: {
                remoteFileSize: 0,
                downloadSize: 0,
                acceptRange: true,
                downloadURL: "http://localhost/fail.bin",
                originalURL: "http://localhost/fail.bin",
                downloadURLUpdateDate: Date.now()
            },
            onProgress: () => { },
            fetchChunks: async () => {
                throw new Error("Simulated network error");
            }
        };
    }
    async fetchDownloadInfo() {
        throw new Error("Simulated network error");
    }
    async chunkGenerator() {
        throw new Error("Simulated network error");
    }
    get transferAction() {
        return "Downloading";
    }
    get supportDynamicStreamLength() {
        return false;
    }
    get options() {
        return {};
    }
}

describe("FetchStream Error Propagation", () => {
    test("should propagate fetchStream errors and not hang", async ({expect}) => {
        const fetchStream = new FailingFetchStream();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "fail.bin",
            parts: [
                {
                    downloadURL: "http://localhost/fail.bin",
                    originalURL: "http://localhost/fail.bin",
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 1,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: {start: 0, end: -1}
                }
            ]
        };
        const downloader = new DownloadEngineFile(file, {writeStream});
        await expect(downloader.download()).rejects.toThrow("Simulated network error");
    });
});
