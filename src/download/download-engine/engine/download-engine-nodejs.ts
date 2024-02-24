import path from "path";
import fs from "fs-extra";
import {DownloadEngineFileOptions, DownloadFile} from "../types.js";
import DownloadEngineFile from "../download-engine-file.js";
import DownloadEngineFetchStreamFetch from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineWriteStreamNodejs from "../streams/download-engine-write-stream/download-engine-write-stream-nodejs.js";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import DownloadEngineFetchStreamLocalFile from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-local-file.js";
import ProgressStatusFile from "../progress-status-file.js";
import BaseDownloadEngine from "./base-download-engine.js";

export const PROGRESS_FILE_EXTENSION = ".ipull";

export type DownloadEngineOptionsNodejsCustomFetch =
    Omit<Partial<DownloadEngineFileOptions>, "saveProgress" | "writeStream" | "onFinished" | "onProgress">
    & {
    fetchStream: BaseDownloadEngineFetchStream,
    objectType?: string;
    fileName?: string;
    headers?: Record<string, string>;
    acceptRangeIsKnown?: boolean;
    directory?: string;
    onFinished?: (downloader: DownloadEngineNodejs) => void | Promise<void>;
    onProgress?: (status: ProgressStatusFile, downloader: DownloadEngineNodejs) => void | Promise<void>;
    onStart?: (downloader: DownloadEngineNodejs) => void | Promise<void>;
    onInit?: (downloader: DownloadEngineNodejs) => void | Promise<void>;
    onFdClosed?: (downloader: DownloadEngineNodejs) => void | Promise<void>;
};

export type DownloadEngineOptionsNodejs = Omit<DownloadEngineOptionsNodejsCustomFetch, "fetchStream">;

export default class DownloadEngineNodejs extends BaseDownloadEngine {
    protected constructor(engine: DownloadEngineFile) {
        super(engine);
    }

    /**
     * Download one file from a URL or a list of URLs (file split to parts)
     */
    static async fromParts(partsURL: string | string[], options: Partial<DownloadEngineOptionsNodejs> = {}) {
        return DownloadEngineNodejs._fromPartsCustomFetch(partsURL, {
            ...options,
            fetchStream: new DownloadEngineFetchStreamFetch(options)
        });
    }

    /**
     * Copy file with progress
     */
    static async copyLocalFile(fileParts: string | string[], options: Partial<DownloadEngineOptionsNodejs>) {
        return DownloadEngineNodejs._fromPartsCustomFetch(fileParts, {
            ...options,
            fetchStream: new DownloadEngineFetchStreamLocalFile(options)
        });
    }

    protected static async _fromPartsCustomFetch(urlParts: string | string[], options: DownloadEngineOptionsNodejsCustomFetch) {
        const downloadFile = await DownloadEngineNodejs._createDownloadFile(urlParts, options.fetchStream);
        const downloadLocation = DownloadEngineNodejs._createDownloadLocation(downloadFile, options);

        const writeStream = new DownloadEngineWriteStreamNodejs(downloadLocation + PROGRESS_FILE_EXTENSION, options);
        writeStream.fileSize = downloadFile.totalSize;

        downloadFile.downloadProgress = await writeStream.loadMetadataAfterFileWithoutRetry();
        const engine = new DownloadEngineFile(downloadFile, {
            ...options,
            writeStream,
            async onProgress(status) {
                await options.onProgress?.(status, nodejsDownloadEngine);
            },
            async saveProgress(progress) {
                await writeStream.saveMedataAfterFile(progress);
            },
            async onFinished() {
                await writeStream.ftruncate();
                await options.onFinished?.(nodejsDownloadEngine);
            },
            async onFdClosed() {
                await fs.rename(downloadLocation + PROGRESS_FILE_EXTENSION, downloadLocation);
                await options.onFdClosed?.(nodejsDownloadEngine);
            },
            async onStart() {
                await options.onStart?.(nodejsDownloadEngine);
            }
        });
        const nodejsDownloadEngine = new DownloadEngineNodejs(engine);
        await options.onInit?.(nodejsDownloadEngine);
        return nodejsDownloadEngine;
    }

    protected static _createDownloadLocation(download: DownloadFile, options: Partial<DownloadEngineOptionsNodejs>) {
        const fileName = options.fileName || download.localFileName;
        const directory = options.directory || process.cwd();
        return path.join(directory, fileName);
    }
}
