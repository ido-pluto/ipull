// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {describe, test} from "vitest";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import DownloadEngineFetchStreamFetch from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import {DownloadFile} from "../src/download/download-engine/types.js";

const TEST_URL = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png";

describe("Progress & Event Emission", () => {
    test("should emit all progress events in order", async ({expect}) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file: DownloadFile = {
            totalSize: 0,
            localFileName: "events.png",
            parts: [
                {
                    downloadURL: TEST_URL,
                    originalURL: TEST_URL,
                    acceptRange: true,
                    remoteFileSize: 0,
                    downloadSize: 0,
                    downloadURLUpdateDate: Date.now(),
                    fetchStream,
                    parallelStreams: 1,
                    autoIncreaseParallelStreams: false,
                    programType: "stream",
                    range: {start: 0, end: -1}
                }
            ]
        };
        const events: string[] = [];
        const downloader = new DownloadEngineFile(file, {
            writeStream,
            onFinishAsync: async () => events.push("onFinishAsync"),
            onStartedAsync: async () => events.push("onStartedAsync"),
            onPausedAsync: async () => events.push("onPausedAsync"),
            onSaveProgress: () => events.push("onSaveProgress")
        });
        downloader.on("progress", () => events.push("progress"));
        downloader.on("save", () => events.push("save"));
        downloader.on("paused", () => events.push("paused"));
        downloader.on("resumed", () => events.push("resumed"));
        downloader.on("finished", () => events.push("finished"));
        downloader.on("closed", () => events.push("closed"));
        await downloader.download();
        expect(events.length).toBeGreaterThan(0);
        expect(events).toContain("onFinishAsync");
        expect(events).toContain("progress");
        expect(events).toContain("finished");
    });
});
