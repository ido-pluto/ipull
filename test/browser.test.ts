import {describe, expect, test} from "vitest";
import {downloadFileBrowser, downloadFileBrowserMemory} from "../src/browser.js";
import {hashBuffer} from "./utils/hash.js";
import {BIG_IMAGE} from "./utils/files.js";

// @ts-ignore
globalThis.XMLHttpRequest = await import("xmlhttprequest-ssl").then(m => m.XMLHttpRequest);

describe("Browser", () => {
    test("Download file browser - memory", async () => {
        const {downloader, memory} = await downloadFileBrowserMemory(BIG_IMAGE);

        await downloader.download();

        const hash = hashBuffer(memory.buffer);
        expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test("Download file browser - memory (xhr)", async () => {

        const {downloader, memory} = await downloadFileBrowserMemory(BIG_IMAGE, {
            fetchStrategy: "xhr"
        });

        await downloader.download();

        const hash = hashBuffer(memory.buffer);
        expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test("Download file browser", async () => {
        let buffer = Buffer.alloc(0);
        let lastWrite = 0;
        const downloader = await downloadFileBrowser(BIG_IMAGE, {
            onWrite(cursor, data) {
                buffer.set(data, cursor);
                if (cursor + data.length > lastWrite) {
                    lastWrite = cursor + data.length;
                }
            }
        });

        buffer = Buffer.alloc(downloader.file.totalSize);

        await downloader.download();
        expect(hashBuffer(buffer))
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
        expect(lastWrite)
            .toMatchInlineSnapshot(downloader.file.totalSize);
    });
});
