import DownloadEngineBrowser, {DownloadEngineOptionsBrowser} from "./download-engine/engine/download-engine-browser.js";
import DownloadEngineMultiDownload from "./download-engine/engine/download-engine-multi-download.js";

const DEFAULT_PARALLEL_STREAMS_FOR_BROWSER = 3;

export type DownloadFileBrowserOptions = DownloadEngineOptionsBrowser & {
    /** @deprecated use partURLs instead */
    partsURL?: string[];
};

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
export async function downloadSequenceBrowser(...downloads: (DownloadEngineBrowser | Promise<DownloadEngineBrowser>)[]) {
    return await DownloadEngineMultiDownload.fromEngines(downloads);
}
