import {describe, test, beforeAll, afterAll} from "vitest";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import DownloadEngineFetchStreamFetch from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import InvalidContentLengthError from "../src/download/download-engine/streams/download-engine-fetch-stream/errors/invalid-content-length-error.js";
import {DownloadFile} from "../src/download/download-engine/types.js";
import {startLocalTestServer, LocalTestServer, TEST_FILE_SIZE} from "./utils/local-server.js";

let server: LocalTestServer;
let baseURL: string;

beforeAll(async () => {
    server = await startLocalTestServer();
    baseURL = server.baseURL;
});

afterAll(async () => {
    await server.close();
});

describe("Content-Length Mismatch", () => {
    test("should download a real 8MB+ file using the engine", async ({expect}) => {
        const url = `${baseURL}/range-file.bin`;
        const file = await fetch(url, {method: "HEAD"});
        expect(file.status).toBe(200);

        const fetchStream = new DownloadEngineFetchStreamFetch();
        let totalBytes = 0;
        const writeStream = new DownloadEngineWriteStreamBrowser((_cursor, buffers) => {
            totalBytes += buffers.reduce((sum, buffer) => sum + buffer.length, 0);
        });

        const downloadFile: DownloadFile = {
            totalSize: TEST_FILE_SIZE,
            localFileName: "file.bin",
            parts: [
                {
                    downloadURL: url,
                    originalURL: url,
                    acceptRange: true,
                    remoteFileSize: TEST_FILE_SIZE,
                    downloadSize: TEST_FILE_SIZE,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 1,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: {start: 0, end: TEST_FILE_SIZE - 1}
                }
            ]
        };

        const downloader = new DownloadEngineFile(downloadFile, {writeStream, chunkSize: 1024 * 512});
        await downloader.download();

        expect(totalBytes).toBe(TEST_FILE_SIZE);
    });

    test("should throw InvalidContentLengthError if server responds with wrong Content-Length", async ({expect}) => {
        const url = `${baseURL}/bad-length.bin`;
        const fetchStream = new DownloadEngineFetchStreamFetch();
        let totalBytes = 0;
        const writeStream = new DownloadEngineWriteStreamBrowser((_cursor, buffers) => {
            totalBytes += buffers.reduce((sum, buffer) => sum + buffer.length, 0);
        });

        const downloadFile: DownloadFile = {
            totalSize: TEST_FILE_SIZE,
            localFileName: "bad-length.bin",
            parts: [
                {
                    downloadURL: url,
                    originalURL: url,
                    acceptRange: true,
                    remoteFileSize: TEST_FILE_SIZE,
                    downloadSize: TEST_FILE_SIZE,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 1,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: {start: 0, end: TEST_FILE_SIZE - 1}
                }
            ]
        };

        const downloader = new DownloadEngineFile(downloadFile, {writeStream, chunkSize: 1024 * 512});
        await expect(downloader.download()).rejects.toThrow(InvalidContentLengthError);
        expect(totalBytes).toBe(0);
    });
});
