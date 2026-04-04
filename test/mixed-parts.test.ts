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

describe("Mixed Parts (Range + Non-Range)", () => {
    test("should download with mixed range and non-range parts", async ({ expect }) => {
        const fetchStream1 = new DownloadEngineFetchStreamFetch();
        const fetchStream2 = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "mixed.png",
            parts: [
                {
                    downloadURL: `${baseURL}/range-file.bin`,
                    originalURL: `${baseURL}/range-file.bin`,
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream: fetchStream1,
                    parallelStreams: 2,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: { start: 0, end: -1 }
                },
                {
                    downloadURL: `${baseURL}/no-range-file.png`,
                    originalURL: `${baseURL}/no-range-file.png`,
                    acceptRange: false,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream: fetchStream2,
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
});
