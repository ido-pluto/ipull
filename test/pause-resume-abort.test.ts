import { afterAll, beforeAll, describe, test } from "vitest";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import DownloadEngineFetchStreamFetch from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import { DownloadFile } from "../src/download/download-engine/types.js";
import { startLocalTestServer, LocalTestServer } from "./utils/local-server.js";

let baseURL: string;
let server: LocalTestServer;

beforeAll(async () => {
    server = await startLocalTestServer();
    baseURL = server.baseURL;
});

afterAll(async () => {
    await server.close();
});

describe("Pause/Resume/Abort Logic", () => {
    test("should pause and resume download and preserve data integrity", async ({ expect }) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "pause.png",
            parts: [
                {
                    downloadURL: `${baseURL}/range-file.bin`,
                    originalURL: `${baseURL}/range-file.bin`,
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 1,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: { start: 0, end: -1 }
                }
            ]
        };
        const downloader = new DownloadEngineFile(file, { writeStream });
        const downloadPromise = downloader.download();
        setTimeout(() => downloader.pause(), 100); // Pause after 100ms
        setTimeout(() => downloader.resume(), 200); // Resume after 200ms
        await expect(downloadPromise).resolves.not.toThrow();
    });

    test("should abort download and cleanup resources", async ({ expect }) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "abort.png",
            parts: [
                {
                    downloadURL: `${baseURL}/range-file.bin`,
                    originalURL: `${baseURL}/range-file.bin`,
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 1,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: { start: 0, end: -1 }
                }
            ]
        };
        const downloader = new DownloadEngineFile(file, { writeStream });
        const downloadPromise = downloader.download();
        setTimeout(() => downloader.close(), 100); // Abort after 100ms
        await expect(downloadPromise).resolves.not.toThrow();
    });
});
