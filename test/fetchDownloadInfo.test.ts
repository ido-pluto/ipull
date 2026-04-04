import {afterAll, beforeAll, describe, test} from "vitest";
import {downloadFile} from "../src/index.js";
import fsPromise from "fs/promises";
import {startLocalTestServer, LocalTestServer, TEST_FILE_SIZE} from "./utils/local-server.js";

let baseURL: string;
let server: LocalTestServer;

beforeAll(async () => {
    server = await startLocalTestServer();
    baseURL = server.baseURL;
});

afterAll(async () => {
    await server.close();
});

describe("Fetch download info", () => {
    test("Fetch download info GET", async ({expect}) => {
        const downloader = await downloadFile({
            url: `${baseURL}/file.json`,
            directory: "."
        });

        expect(downloader.file.totalSize > 0).toBeTruthy();
    });

    test("Refetch download info when token is expired", async ({expect}) => {
        const downloader = await downloadFile({
            url: `${baseURL}/fileCreateToken.gguf`,
            directory: ".",
            programType: "chunks",
            parallelStreams: 3
        });

        await downloader.download();
        const fileSize = (await fsPromise.stat(downloader.finalFileAbsolutePath)).size;
        expect(fileSize).toBe(TEST_FILE_SIZE);
    });
});
