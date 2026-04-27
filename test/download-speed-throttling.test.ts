import fs from "fs/promises";
import os from "os";
import path from "path";
import {performance} from "perf_hooks";
import {afterAll, beforeAll, describe, test} from "vitest";
import {downloadFile} from "../src/index.js";
import {LocalTestServer, startLocalTestServer, THROTTLE_TEST_FILE_SIZE} from "./utils/local-server.js";

const MAX_DOWNLOAD_SPEED = 128 * 1024;
const BURST_SECONDS = 0.5;

let baseURL: string;
let server: LocalTestServer;

beforeAll(async () => {
    server = await startLocalTestServer();
    baseURL = server.baseURL;
});

afterAll(async () => {
    await server.close();
});

async function downloadThrottleFixture(maxDownloadSpeed?: number) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ipull-speed-"));

    try {
        const downloader = await downloadFile({
            url: `${baseURL}/throttle-file.bin`,
            directory,
            cliProgress: false,
            parallelStreams: 1,
            autoIncreaseParallelStreams: false,
            maxDownloadSpeed
        });

        const start = performance.now();
        await downloader.download();
        const elapsedMs = performance.now() - start;
        const fileSize = (await fs.stat(downloader.finalFileAbsolutePath)).size;

        return {
            elapsedMs,
            bytesPerSecond: fileSize / (elapsedMs / 1000),
            fileSize
        };
    } finally {
        await fs.rm(directory, {recursive: true, force: true});
    }
}

describe("Download speed throttling", () => {
    test("downloads from the local server without throttling", async ({expect}) => {
        const result = await downloadThrottleFixture();

        expect(result.fileSize).toBe(THROTTLE_TEST_FILE_SIZE);
        expect(result.bytesPerSecond).toBeGreaterThan(MAX_DOWNLOAD_SPEED);
    });

    test("limits local-server download speed when maxDownloadSpeed is set", async ({expect}) => {
        const result = await downloadThrottleFixture(MAX_DOWNLOAD_SPEED);
        const expectedMinElapsedMs = (THROTTLE_TEST_FILE_SIZE / MAX_DOWNLOAD_SPEED - BURST_SECONDS) * 1000;

        expect(result.fileSize).toBe(THROTTLE_TEST_FILE_SIZE);
        expect(result.elapsedMs).toBeGreaterThanOrEqual(expectedMinElapsedMs * 0.8);
        expect(result.bytesPerSecond).toBeLessThanOrEqual(MAX_DOWNLOAD_SPEED / (1 - BURST_SECONDS / (THROTTLE_TEST_FILE_SIZE / MAX_DOWNLOAD_SPEED)) * 1.2);
    });
});
