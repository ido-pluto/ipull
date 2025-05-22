import DownloadEngineBrowser, {DownloadEngineOptionsBrowser} from "./download-engine/engine/download-engine-browser.js";
import DownloadEngineMultiDownload, {DownloadEngineMultiDownloadOptions} from "./download-engine/engine/download-engine-multi-download.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import {DownloadSequenceOptions} from "./node-download.js";
import {DownloadEngineRemote} from "./download-engine/engine/DownloadEngineRemote.js";

const DEFAULT_PARALLEL_STREAMS_FOR_BROWSER = 3;

export type DownloadFileBrowserOptions = DownloadEngineOptionsBrowser;

export type DownloadSequenceBrowserOptions = DownloadEngineMultiDownloadOptions;

/**
 * Download one file in the browser environment.
 */
export async function downloadFileBrowser(options: DownloadFileBrowserOptions) {
    options.parallelStreams ??= DEFAULT_PARALLEL_STREAMS_FOR_BROWSER;
    return await DownloadEngineBrowser.createFromOptions(options);
}

/**
 * Stream events for a download from remote session, doing so by calling `emitRemoteProgress` with the progress info.
 */
export function downloadFileRemoteBrowser() {
    return new DownloadEngineRemote();
}

/**
 * Download multiple files in the browser environment.
 */
export async function downloadSequenceBrowser(options?: DownloadSequenceBrowserOptions | DownloadEngineBrowser | Promise<DownloadEngineBrowser>, ...downloads: (DownloadEngineBrowser | Promise<DownloadEngineBrowser>)[]) {
    let downloadOptions: DownloadSequenceOptions = {};
    if (options instanceof BaseDownloadEngine || options instanceof Promise) {
        downloads.unshift(options);
    } else if (options) {
        downloadOptions = options;
    }

    const downloader = new DownloadEngineMultiDownload(downloadOptions);
    await downloader.addDownload(...downloads);

    return downloader;
}
