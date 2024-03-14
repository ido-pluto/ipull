import {describe, test} from "vitest";
import {downloadFileBrowser} from "../src/browser.js";
import {hashBuffer} from "./utils/hash.js";
import {BIG_FILE} from "./utils/files.js";
import {BIG_FILE_EXAMPLE, ensureLocalFile} from "./utils/download.js";
import fs from "fs-extra";

// @ts-ignore
globalThis.XMLHttpRequest = await import("xmlhttprequest-ssl").then(m => m.XMLHttpRequest);

describe("Browser Fetch API", () => {
    test.concurrent("Download file browser - memory", async (context) => {
        const downloader = await downloadFileBrowser({
            url: BIG_FILE
        });

        await downloader.download();
        const hash = hashBuffer(downloader.writeStream.result);
        context.expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test.concurrent("Download file browser", async (context) => {
        let buffer = Buffer.alloc(0);
        let lastWrite = 0;
        const downloader = await downloadFileBrowser({
            url: BIG_FILE,
            onWrite(cursor, data) {
                buffer.set(data, cursor);
                if (cursor + data.length > lastWrite) {
                    lastWrite = cursor + data.length;
                }
            }
        });

        buffer = Buffer.alloc(downloader.file.totalSize);

        await downloader.download();
        context.expect(hashBuffer(buffer))
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
        context.expect(lastWrite)
            .toBe(downloader.file.totalSize);
    });
}, {timeout: 1000 * 60 * 3});

describe("Browser Fetch memory", () => {
    test.sequential("Download file for tests", async (context) => {
        const response = await ensureLocalFile(BIG_FILE, BIG_FILE_EXAMPLE);

        const buffer = Buffer.from(await fs.readFile(response));
        const hash = hashBuffer(buffer);
        context.expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test.sequential("Download file browser - memory (xhr)", async (context) => {
        const originalFile = await ensureLocalFile(BIG_FILE, BIG_FILE_EXAMPLE);
        const originalFileBuffer = new Uint8Array(await fs.readFile(originalFile));

        const downloader = await downloadFileBrowser({
            url: BIG_FILE,
            fetchStrategy: "xhr"
        });

        await downloader.download();
        context.expect(originalFileBuffer.length)
            .toBe(downloader.downloadSize);

        const diff = originalFileBuffer.findIndex((value, index) => value !== downloader.writeStream.result[index]);
        context.expect(diff)
            .toBe(-1);
    });

    test.sequential("Download file browser - chunks, memory (fetch)", async (context) => {
        const originalFile = await ensureLocalFile(BIG_FILE, BIG_FILE_EXAMPLE);
        const originalFileBuffer = new Uint8Array(await fs.readFile(originalFile));

        const downloader = await downloadFileBrowser({
            url: BIG_FILE,
            fetchStrategy: "fetch",
            programType: "chunks",
            ignoreIfRangeWithQueryParams: true,
            acceptRangeIsKnown: true
        });

        await downloader.download();
        context.expect(originalFileBuffer.length)
            .toBe(downloader.downloadSize);

        const diff = originalFileBuffer.findIndex((value, index) => value !== downloader.writeStream.result[index]);
        context.expect(diff)
            .toBe(-1);
    });
}, {timeout: 1000 * 60 * 3});
