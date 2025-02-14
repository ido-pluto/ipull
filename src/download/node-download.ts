import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download-engine/engine/download-engine-nodejs.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import DownloadEngineMultiDownload, {DownloadEngineMultiDownloadOptions} from "./download-engine/engine/download-engine-multi-download.js";
import {CliProgressDownloadEngineOptions, globalCLI} from "./transfer-visualize/transfer-cli/GlobalCLI.js";

const DEFAULT_PARALLEL_STREAMS_FOR_NODEJS = 3;
export type DownloadFileOptions = DownloadEngineOptionsNodejs & CliProgressDownloadEngineOptions;

/**
 * Download one file with CLI progress
 */
export async function downloadFile(options: DownloadFileOptions) {
    options.parallelStreams ??= DEFAULT_PARALLEL_STREAMS_FOR_NODEJS;

    const downloader = DownloadEngineNodejs.createFromOptions(options);
    globalCLI.addDownload(downloader, options);

    return await downloader;
}

export type DownloadSequenceOptions = CliProgressDownloadEngineOptions & DownloadEngineMultiDownloadOptions & {
    fetchStrategy?: "localFile" | "fetch";
};


/**
 * Download multiple files with CLI progress
 */
export function downloadSequence(options?: DownloadSequenceOptions | DownloadEngineNodejs | Promise<DownloadEngineNodejs>, ...downloads: (DownloadEngineNodejs | Promise<DownloadEngineNodejs>)[]) {
    let downloadOptions: DownloadSequenceOptions = {};
    if (options instanceof BaseDownloadEngine || options instanceof Promise) {
        downloads.unshift(options);
    } else if (options) {
        downloadOptions = options;
    }

    const downloader = new DownloadEngineMultiDownload(downloadOptions);
    downloader.addDownload(...downloads);
    globalCLI.addDownload(downloader, downloadOptions);

    return downloader;
}
