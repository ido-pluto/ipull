import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download-engine/engine/download-engine-nodejs.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import DownloadEngineMultiDownload from "./download-engine/engine/download-engine-multi-download.js";
import CliAnimationWrapper, {CliProgressDownloadEngineOptions} from "./transfer-visualize/transfer-cli/cli-animation-wrapper.js";
import {CLI_LEVEL} from "./transfer-visualize/transfer-cli/transfer-cli.js";

const DEFAULT_PARALLEL_STREAMS_FOR_NODEJS = 3;
export type DownloadFileOptions = DownloadEngineOptionsNodejs & CliProgressDownloadEngineOptions;

/**
 * Download one file with CLI progress
 */
export async function downloadFile(options: DownloadFileOptions) {
    options.parallelStreams ??= DEFAULT_PARALLEL_STREAMS_FOR_NODEJS;

    const downloader = DownloadEngineNodejs.createFromOptions(options);
    const wrapper = new CliAnimationWrapper(downloader, options);

    await wrapper.attachAnimation();
    return await downloader;
}

export type DownloadSequenceOptions = CliProgressDownloadEngineOptions & {
    fetchStrategy?: "localFile" | "fetch";
};

/**
 * Download multiple files with CLI progress
 */
export async function downloadSequence(options: DownloadSequenceOptions | DownloadEngineNodejs | Promise<DownloadEngineNodejs>, ...downloads: (DownloadEngineNodejs | Promise<DownloadEngineNodejs>)[]) {
    let downloadOptions: DownloadSequenceOptions = {};
    if (options instanceof BaseDownloadEngine || options instanceof Promise) {
        downloads.unshift(options);
    } else {
        downloadOptions = options;
    }

    downloadOptions.cliLevel = CLI_LEVEL.HIGH;
    const downloader = DownloadEngineMultiDownload.fromEngines(downloads);
    const wrapper = new CliAnimationWrapper(downloader, downloadOptions);

    await wrapper.attachAnimation();
    return await downloader;
}
