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
            url: BIG_FILE,
            parallelStreams: 2,
            autoIncreaseParallelStreams: false
        });

        await downloader.download();
        const hash = hashBuffer(downloader.writeStream.result);
        context.expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test.concurrent("Download file browser", async (context) => {
        const response = await ensureLocalFile(BIG_FILE, BIG_FILE_EXAMPLE);
        const bufferIsCorrect = Buffer.from(await fs.readFile(response));

        let bigBuffer = Buffer.alloc(0);
        let lastWrite = 0;
        const downloader = await downloadFileBrowser({
            url: BIG_FILE,
            parallelStreams: 2,
            autoIncreaseParallelStreams: false,
            onWrite(cursor, data) {
                let writeLocation = cursor;
                for (const buffer of data) {
                    bigBuffer.set(buffer, writeLocation);
                    writeLocation += buffer.length;
                }

                if (writeLocation > lastWrite) {
                    lastWrite = writeLocation;
                }
            }
        });

        bigBuffer = Buffer.alloc(downloader.file.totalSize);
        await downloader.download();

        const diff = bigBuffer.findIndex((value, index) => value !== bufferIsCorrect[index]);
        context.expect(diff)
            .toBe(-1);

        context.expect(lastWrite)
            .toBe(downloader.file.totalSize);
        context.expect(hashBuffer(bigBuffer))
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    }, {repeats: 4, concurrent: true});
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
