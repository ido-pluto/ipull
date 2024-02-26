import DownloadEngineBrowser, {DownloadEngineOptionsBrowser} from "./download-engine/engine/download-engine-browser.js";
import DownloadEngineMultiDownload from "./download-engine/engine/download-engine-multi-download.js";

export type DownloadFileBrowserOptions = DownloadEngineOptionsBrowser;

/**
 * Download one file in the browser environment.
 */
export async function downloadFileBrowser(options: DownloadFileBrowserOptions) {
    return await DownloadEngineBrowser.createFromOptions(options);
}

/**
 * Download multiple files in the browser environment.
 */
export async function downloadSequenceBrowser(...downloads: (DownloadEngineBrowser | Promise<DownloadEngineBrowser>)[]) {
    const allDownloads = await Promise.all(downloads);
    return new DownloadEngineMultiDownload(allDownloads);
}
