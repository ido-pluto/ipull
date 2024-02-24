import {describe, test} from "vitest";
import {downloadFileBrowser, downloadFileBrowserMemory} from "../src/browser.js";
import {hashBuffer} from "./utils/hash.js";
import {BIG_IMAGE} from "./utils/files.js";

// @ts-ignore
globalThis.XMLHttpRequest = await import("xmlhttprequest-ssl").then(m => m.XMLHttpRequest);

describe("Browser", () => {
    test.concurrent("Download file browser - memory", async (context) => {
        const {downloader, memory} = await downloadFileBrowserMemory(BIG_IMAGE);

        await downloader.download();

        const hash = hashBuffer(memory.buffer);
        context.expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test.concurrent("Download file browser - memory (xhr)", async (context) => {

        const {downloader, memory} = await downloadFileBrowserMemory(BIG_IMAGE, {
            fetchStrategy: "xhr"
        });

        await downloader.download();

        const hash = hashBuffer(memory.buffer);
        context.expect(hash)
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
    });

    test.concurrent("Download file browser", async (context) => {
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
        context.expect(hashBuffer(buffer))
            .toMatchInlineSnapshot("\"9ae3ff19ee04fc02e9c60ce34e42858d16b46eeb88634d2035693c1ae9dbcbc9\"");
        context.expect(lastWrite)
            .toMatchInlineSnapshot(downloader.file.totalSize);
    });
});
