import DownloadEngineBrowser, {DownloadEngineOptionsBrowser} from "./download-engine/engine/download-engine-browser.js";
import DownloadEngineMultiDownload, {DownloadEngineMultiDownloadOptions} from "./download-engine/engine/download-engine-multi-download.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import {DownloadSequenceOptions} from "./node-download.js";

const DEFAULT_PARALLEL_STREAMS_FOR_BROWSER = 3;

export type DownloadFileBrowserOptions = DownloadEngineOptionsBrowser & {
    /** @deprecated use partURLs instead */
    partsURL?: string[];
};

export type DownloadSequenceBrowserOptions = DownloadEngineMultiDownloadOptions;

/**
 * Download one file in the browser environment.
 */
export async function downloadFileBrowser(options: DownloadFileBrowserOptions) {
    // TODO: Remove in the next major version
    if (!("url" in options) && options.partsURL) {
        options.partURLs ??= options.partsURL;
    }

    options.parallelStreams ??= DEFAULT_PARALLEL_STREAMS_FOR_BROWSER;
    return await DownloadEngineBrowser.createFromOptions(options);
}

/**
 * Download multiple files in the browser environment.
 */
export function downloadSequenceBrowser(options?: DownloadSequenceBrowserOptions | DownloadEngineBrowser | Promise<DownloadEngineBrowser>, ...downloads: (DownloadEngineBrowser | Promise<DownloadEngineBrowser>)[]) {
    let downloadOptions: DownloadSequenceOptions = {};
    if (options instanceof BaseDownloadEngine || options instanceof Promise) {
        downloads.unshift(options);
    } else if (options) {
        downloadOptions = options;
    }

    const downloader = new DownloadEngineMultiDownload(downloadOptions);
    downloader.addDownload(...downloads);

    return downloader;
}
