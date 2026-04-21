
import {afterAll, beforeAll, describe, expect, test} from "vitest";
import {downloadFileBrowser} from "../src/browser.js";
import {InvalidOptionError} from "../src/download/download-engine/engine/error/InvalidOptionError.js";
import {RangeOutOfPartLengthError} from "../src/download/download-engine/engine/error/RangeOutOfPartLengthError.js";
import {LocalTestServer, startLocalTestServer, TEST_FILE_SIZE} from "./utils/local-server.js";

let baseURL: string;
let server: LocalTestServer;

describe("Range Validation & Error Handling", () => {
    beforeAll(async () => {
        server = await startLocalTestServer();
        baseURL = server.baseURL;
    });

    afterAll(async () => {
        await server.close();
    });

    test("should reject when range end exceeds the remote file size", async () => {
        await expect(downloadFileBrowser({
            url: `${baseURL}/range-file.bin`,
            range: {
                start: TEST_FILE_SIZE - 128,
                end: TEST_FILE_SIZE + 128
            }
        })).rejects.toThrow(RangeOutOfPartLengthError);
    });

    test("should reject when range start is greater than range end", async () => {
        await expect(downloadFileBrowser({
            url: `${baseURL}/range-file.bin`,
            range: {start: 512, end: 256}
        })).rejects.toThrow(InvalidOptionError);
    });

    test("should reject when range start is negative", async () => {
        await expect(downloadFileBrowser({
            url: `${baseURL}/range-file.bin`,
            range: {start: -1, end: 128}
        })).rejects.toThrow(InvalidOptionError);
    });
});
