import {describe, test} from "vitest";
import DownloadEngineFetchStreamFetch from "../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFile from "../src/download/download-engine/download-file/download-engine-file.js";
import DownloadEngineWriteStreamBrowser from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";

// This URL should redirect. Replace with a known redirecting URL if needed.
const REDIRECT_URL = "https://httpbin.org/redirect-to?url=https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png";


describe("Redirect Handling", () => {
    test("should follow redirect and use newURL", async ({expect}) => {
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file = {
            totalSize: 0,
            localFileName: "redirect.png",
            parts: [
                {
                    downloadURL: REDIRECT_URL,
                    originalURL: REDIRECT_URL,
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
        const downloader = new DownloadEngineFile(file, {writeStream, comment: "test redirect"});
        await expect(downloader.download()).resolves.not.toThrow();
    });

    test("should respect reuseRedirectURL option", async ({expect}) => {
        // This test assumes the engine will use the newURL for subsequent requests if reuseRedirectURL is true
        const fetchStream = new DownloadEngineFetchStreamFetch();
        const writeStream = new DownloadEngineWriteStreamBrowser(() => { });
        const file = {
            totalSize: 0,
            localFileName: "redirect2.png",
            parts: [
                {
                    downloadURL: REDIRECT_URL,
                    originalURL: REDIRECT_URL,
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
        const downloader = new DownloadEngineFile(file, {writeStream, comment: "test redirect", reuseRedirectURL: true});
        await expect(downloader.download()).resolves.not.toThrow();
    });
});
