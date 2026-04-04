import {describe, test} from "vitest";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import {ChunkStatus} from "../src/download/download-engine/types.js";
import {createDownloadFile} from "./utils/download.js";
import {BIG_FILE} from "./utils/files.js";

describe("File Download", () => {
    test("Parallel connection download", async ({expect}) => {
        const MIN_PARALLEL_CONNECTIONS = 4;
        const randomNumber = Math.max(MIN_PARALLEL_CONNECTIONS, Math.floor(Math.random() * 30));
        const writeStream = new DownloadEngineWriteStreamBrowser(() => {
        });

        const file = await createDownloadFile(BIG_FILE, {parallelStreams: randomNumber, autoIncreaseParallelStreams: false});

        let saveProgressCalledLength = 0;
        let maxInParallelConnections = 0;
        const downloader = new DownloadEngineFile(file, {
            chunkSize: 1024 ** 1.5,
            writeStream
        });

        downloader.on("save", progress => {
            const inProgressLength = progress.chunks.filter(c => c === ChunkStatus.IN_PROGRESS).length;

            maxInParallelConnections = Math.max(maxInParallelConnections, inProgressLength);
            saveProgressCalledLength++;
        });

        await downloader.download();
        expect(saveProgressCalledLength)
            .toBeGreaterThan(randomNumber);
        expect(maxInParallelConnections)
            .toBe(randomNumber - 1);
    });


    test("Total bytes written", async ({expect}) => {
        let totalBytesWritten = 0;
        const writeStream = new DownloadEngineWriteStreamBrowser((cursor, data) => {
            totalBytesWritten += data.reduce((sum, buffer) => sum + buffer.length, 0);
        });

        const file = await createDownloadFile(BIG_FILE);
        const downloader = new DownloadEngineFile(file, {
            chunkSize: 1024 * 1024 * 25,
            writeStream
        });

        await downloader.download();
        expect(totalBytesWritten)
            .toBe(file.totalSize);
    });
});
