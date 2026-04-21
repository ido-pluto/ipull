import { afterAll, beforeAll, describe, expect, test } from "vitest";
import fsPromise from "fs/promises";
import os from "os";
import path from "path";
import { downloadFile } from "../src/index.js";
import { startLocalTestServer, LocalTestServer, TEST_FILE_SIZE } from "./utils/local-server.js";

let baseURL: string;
let server: LocalTestServer;

beforeAll(async () => {
    server = await startLocalTestServer();
    baseURL = server.baseURL;
});

afterAll(async () => {
    await server.close();
});


describe("Redirect Handling", () => {
    test("should follow redirect and reuse the redirected URL by default", async () => {
        const savePath = path.join(os.tmpdir(), `ipull-redirect-${Date.now()}-default.gguf`);
        const downloader = await downloadFile({
            url: `${baseURL}/fileCreateToken.gguf`,
            savePath,
            programType: "chunks",
            parallelStreams: 3
        });

        await downloader.download();
        expect(downloader.file.parts[0].originalURL).toBe(`${baseURL}/fileCreateToken.gguf`);
        expect(downloader.file.parts[0].downloadURL).toMatch(new RegExp(`^${baseURL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/file\\.gguf\\?token=`));
        const fileSize = (await fsPromise.stat(downloader.finalFileAbsolutePath)).size;
        expect(fileSize).toBe(TEST_FILE_SIZE);
        await fsPromise.rm(downloader.finalFileAbsolutePath, { force: true });
    });

    test("should respect reuseRedirectURL option when disabled", async () => {
        const savePath = path.join(os.tmpdir(), `ipull-redirect-${Date.now()}-original.gguf`);
        const downloader = await downloadFile({
            url: `${baseURL}/fileCreateToken.gguf`,
            savePath,
            programType: "chunks",
            parallelStreams: 3,
            reuseRedirectURL: false
        });

        await downloader.download();
        expect(downloader.file.parts[0].originalURL).toBe(`${baseURL}/fileCreateToken.gguf`);
        expect(downloader.file.parts[0].downloadURL).toBe(`${baseURL}/fileCreateToken.gguf`);
        const fileSize = (await fsPromise.stat(downloader.finalFileAbsolutePath)).size;
        expect(fileSize).toBe(TEST_FILE_SIZE);
        await fsPromise.rm(downloader.finalFileAbsolutePath, { force: true });
    });
});
