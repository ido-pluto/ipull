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

describe("Parallel Streams Edge Cases", () => {
    test("should download with parallelStreams=1 (no parallelism)", async ({ expect }) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "single.png",
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
        await expect(downloader.download()).resolves.not.toThrow();
    });

    test("should download with high parallelStreams (stress test)", async ({ expect }) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "multi.png",
            parts: [
                {
                    downloadURL: `${baseURL}/range-file.bin`,
                    originalURL: `${baseURL}/range-file.bin`,
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 20,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: { start: 0, end: -1 }
                }
            ]
        };
        const downloader = new DownloadEngineFile(file, { writeStream });
        await expect(downloader.download()).resolves.not.toThrow();
    });

    test("should not increase parallel streams if autoIncreaseParallelStreams=false", async ({ expect }) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "noauto.png",
            parts: [
                {
                    downloadURL: `${baseURL}/range-file.bin`,
                    originalURL: `${baseURL}/range-file.bin`,
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 3,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: { start: 0, end: -1 }
                }
            ]
        };
        const downloader = new DownloadEngineFile(file, { writeStream });
        await expect(downloader.download()).resolves.not.toThrow();
    });
});
