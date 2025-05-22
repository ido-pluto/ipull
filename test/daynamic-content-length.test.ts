import {afterAll, beforeAll, describe, test} from "vitest";
import {ensureLocalFile} from "./utils/download.js";
import {downloadFile} from "../src/index.js";
import {fileHash, hashBuffer} from "./utils/hash.js";
import fs from "fs-extra";
import {downloadFileBrowser} from "../src/browser.js";

const DYNAMIC_DOWNLOAD_FILE = "https://quick-lint-js.com/demo/dist/quick-lint-js-vscode.wasm";
const ORIGINAL_FILE = "dynamic.wasm";
const IPUll_FILE = "dynamic-ipull.wasm";

describe("Dynamic content download", async () => {

    let originalFileHash: string, regularDownload: string;
    beforeAll(async () => {
        regularDownload = await ensureLocalFile(DYNAMIC_DOWNLOAD_FILE, ORIGINAL_FILE);
        originalFileHash = await fileHash(regularDownload);
    }, 1000 * 30);

    afterAll(async () => {
        if (regularDownload) {
            await fs.remove(regularDownload);
        }
    });


    test.concurrent("Nodejs Download", async (context) => {
        const downloader = await downloadFile({
            url: DYNAMIC_DOWNLOAD_FILE,
            directory: ".",
            fileName: IPUll_FILE,
            defaultFetchDownloadInfo: {
                acceptRange: false,
                length: 0
            }
        });

        await downloader.download();
        const ipullFileHash = await fileHash(downloader.fileAbsolutePath);
        await fs.remove(downloader.fileAbsolutePath);

        context.expect(ipullFileHash)
            .toBe(originalFileHash);
    });

    test.concurrent("Browser Download", async (context) => {
        const downloader = await downloadFileBrowser({
            url: DYNAMIC_DOWNLOAD_FILE,
            defaultFetchDownloadInfo: {
                acceptRange: false,
                length: 0
            }
        });

        await downloader.download();
        const ipullFileHash = hashBuffer(downloader.writeStream.result);

        context.expect(ipullFileHash)
            .toBe(originalFileHash);
    });
});
