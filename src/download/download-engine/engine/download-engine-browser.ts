import {DownloadEngineFileOptions, DownloadProgressInfo} from "../types.js";
import DownloadEngineFile from "../download-engine-file.js";
import DownloadEngineFetchStreamFetch from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFetchStreamXhr from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-xhr.js";
import DownloadEngineWriteStreamBrowser, {
    DownloadEngineWriteStreamBrowserWriter
} from "../streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import ProgressStatusFile from "../progress-status-file.js";
import BaseDownloadEngine from "./base-download-engine.js";

export type DownloadEngineOptionsBrowser =
    Omit<Partial<DownloadEngineFileOptions>, "fetchStream" | "writeStream" | "onFinished" | "onProgress">
    & {
    objectType?: string;
    headers?: Record<string, string>;
    acceptRangeIsKnown?: boolean
    progress?: DownloadProgressInfo
    fetchStrategy?: "fetch" | "xhr";
    onWrite: DownloadEngineWriteStreamBrowserWriter,
    onFinished?: (downloader: DownloadEngineBrowser) => void | Promise<void>
    onProgress?: (status: ProgressStatusFile, downloader: DownloadEngineBrowser) => void | Promise<void>
    onStart?: (downloader: DownloadEngineBrowser) => void | Promise<void>
    onInit?: (downloader: DownloadEngineBrowser) => void | Promise<void>;
    onClosed?: (downloader: DownloadEngineBrowser) => void | Promise<void>;
};

export default class DownloadEngineBrowser extends BaseDownloadEngine {
    protected constructor(engine: DownloadEngineFile) {
        super(engine);
    }

    /**
     * Download one file that from a URL or a list of URLs (file split to parts)
     */
    static async fromParts(partsURL: string | string[], options: DownloadEngineOptionsBrowser) {
        const fetchStream = options.fetchStrategy === "xhr" ?
            new DownloadEngineFetchStreamXhr(options) : new DownloadEngineFetchStreamFetch(options);

        const downloadFile = await DownloadEngineBrowser._createDownloadFile(partsURL, fetchStream);
        const writeStream = new DownloadEngineWriteStreamBrowser(options.onWrite, options);

        downloadFile.downloadProgress = options.progress;

        const engine = new DownloadEngineFile(downloadFile, {
            ...options,
            fetchStream,
            writeStream,
            async onFinished() {
                await options.onFinished?.(browserDownloadEngine);
            },
            async onProgress(status) {
                await options.onProgress?.(status, browserDownloadEngine);
            },
            async onStart() {
                await options.onStart?.(browserDownloadEngine);
            },
            async onClosed() {
                await options.onClosed?.(browserDownloadEngine);
            }
        });
        const browserDownloadEngine = new DownloadEngineBrowser(engine);
        await options.onInit?.(browserDownloadEngine);
        return browserDownloadEngine;
    }
}
