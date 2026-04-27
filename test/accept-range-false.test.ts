import {afterAll, beforeAll, describe, test} from "vitest";
import DownloadEngineFetchStreamFetch from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import {DownloadFile} from "../src/download/download-engine/types.js";
import {SMALL_TEST_FILE_SIZE, startLocalTestServer, LocalTestServer} from "./utils/local-server.js";

let baseURL: string;
let server: LocalTestServer;

beforeAll(async () => {
    server = await startLocalTestServer();
    baseURL = server.baseURL;
});

afterAll(async () => {
    await server.close();
});

describe("Accept-Range False & Non-Standard Servers", () => {
    test("should fallback to single stream if accept-range is false", async ({expect}) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "test.png",
            parts: [
                {
                    downloadURL: `${baseURL}/no-range-file.png`,
                    originalURL: `${baseURL}/no-range-file.png`,
                    acceptRange: false,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 3,
                    autoIncreaseParallelStreams: true,
                    programType: "stream",
                    range: {start: 0, end: -1}
                }
            ]
        };
        const downloader = new DownloadEngineFile(file, {writeStream});
        await expect(downloader.download()).resolves.not.toThrow();
    });

    test("should handle content-length 0 but still stream data", async ({expect}) => {
        // This is a synthetic test: we simulate a part with content-length 0 but expect data
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "test.bin",
            parts: [
                {
                    downloadURL: `${baseURL}/no-range-zero.png`,
                    originalURL: `${baseURL}/no-range-zero.png`,
                    acceptRange: false,
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
        await expect(downloader.download()).resolves.not.toThrow();
    });

    test("should not report transferredBytes above the final size for small unknown-length files", async ({expect}) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "small.bin",
            parts: [
                {
                    downloadURL: `${baseURL}/no-range-zero-small.bin`,
                    originalURL: `${baseURL}/no-range-zero-small.bin`,
                    acceptRange: false,
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
        const progressValues: number[] = [];
        const downloader = new DownloadEngineFile(file, {
            writeStream,
            chunkSize: 5 * 1024 * 1024
        });

        downloader.on("progress", ({transferredBytes}) => {
            progressValues.push(transferredBytes);
        });

        await downloader.download();

        expect(downloader.downloadSize).toBe(SMALL_TEST_FILE_SIZE);
        expect(Math.max(...progressValues)).toBeLessThanOrEqual(SMALL_TEST_FILE_SIZE);
    });
});
