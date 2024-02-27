import {describe, test} from "vitest";
import {ChunkStatus} from "../src/download/download-engine/types.js";
import DownloadEngineWriteStreamBrowser
    from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import {BIG_IMAGE} from "./utils/files.js";
import {createDownloadFile} from "./utils/download.js";
import DownloadEngineFetchStreamFetch
    from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFile from "../src/download/download-engine/download-engine-file.js";

describe("File Download", () => {
    test.concurrent("Parallel connection download", async (context) => {
        const MIN_PARALLEL_CONNECTIONS = 4;
        const randomNumber = Math.max(MIN_PARALLEL_CONNECTIONS, Math.floor(Math.random() * 30));
        const fetchStream = new DownloadEngineFetchStreamFetch({
            acceptRangeIsKnown: true
        });
        const writeStream = new DownloadEngineWriteStreamBrowser(() => {
        });

        const file = await createDownloadFile(BIG_IMAGE);

        let saveProgressCalledLength = 0;
        let maxInParallelConnections = 0;
        const downloader = new DownloadEngineFile(file, {
            parallelStreams: randomNumber,
            chunkSize: 1024 ** 2,
            fetchStream,
            writeStream
        });

        downloader.on("save", progress => {
            const inProgressLength = progress.chunks.filter(c => c === ChunkStatus.IN_PROGRESS).length;

            maxInParallelConnections = Math.max(maxInParallelConnections, inProgressLength);
            saveProgressCalledLength++;
        });

        await downloader.download();
        context.expect(saveProgressCalledLength)
            .toBeGreaterThan(randomNumber);
        context.expect(maxInParallelConnections)
            .toBe(randomNumber - 1);
    }, {timeout: 1000 * 60});


    test.concurrent("Total bytes written", async (context) => {
        let totalBytesWritten = 0;
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser((cursor, data) => {
            totalBytesWritten += data.byteLength;
        });

        const file = await createDownloadFile(BIG_IMAGE);
        const downloader = new DownloadEngineFile(file, {
            chunkSize: 1024 * 1024 * 25,
            fetchStream,
            writeStream
        });

        await downloader.download();
        context.expect(totalBytesWritten)
            .toBe(file.totalSize);
    });
});
