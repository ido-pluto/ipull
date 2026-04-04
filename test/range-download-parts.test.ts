import {afterAll, beforeAll, describe, test} from "vitest";
import {fetchRangeDownloadParts} from "./utils/fetchRangeDownloadParts.js";
import {downloadFileBrowser} from "../src/browser.js";
import {startLocalTestServer, LocalTestServer, TEST_FILE_SIZE} from "./utils/local-server.js";

let baseURL: string;
let server: LocalTestServer;
let DOWNLOAD_URLS: Array<{ url: string; range: { start: number; end: number; }; }> = [];

let downloadResults: Uint8Array[] = [], totalLength = 0;
describe("Range download parts", () => {
    beforeAll(async () => {
        server = await startLocalTestServer();
        baseURL = server.baseURL;

        DOWNLOAD_URLS = [
            {url: `${baseURL}/range-file.bin`, range: {start: 0, end: 1024 * 1024 * 3 - 1}},
            {url: `${baseURL}/range-file.bin`, range: {start: 1024 * 1024 * 3, end: 1024 * 1024 * 6 - 1}},
            {url: `${baseURL}/range-file.bin`, range: {start: 1024 * 1024 * 6, end: TEST_FILE_SIZE - 1}}
        ];

        downloadResults = await fetchRangeDownloadParts(DOWNLOAD_URLS);
        totalLength = downloadResults.reduce((acc, part) => acc + part.length, 0);
    }, 1000 * 30);

    afterAll(async () => {
        await server.close();
    });

    test.concurrent("Download from 3 urls different parts and connect into one file", async ({expect}) => {
        const downloader = await downloadFileBrowser({
            partURLs: DOWNLOAD_URLS
        });

        if (totalLength !== downloader.file.totalSize) {
            throw new Error(`Total length mismatch. Expected: ${totalLength}, Got: ${downloader.file.totalSize}`);
        }

        await downloader.download();

        let cursor = 0, partIndex = 0;
        for (const part of downloadResults) {
            for (let i = 0; i < part.length; i++, cursor++) {
                const expectedByte = part[i];
                const actualByte = downloader.writeStream.result[cursor];
                if (expectedByte !== actualByte) {
                    throw new Error(`Byte mismatch at position ${cursor} (part: ${partIndex}). Expected: ${expectedByte}, Got: ${actualByte}`);
                }
            }
            partIndex++;
        }

        expect(cursor).toBe(totalLength);
    });
});
