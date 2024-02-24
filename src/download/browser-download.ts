import DownloadEngineBrowser, {DownloadEngineOptionsBrowser} from "./download-engine/engine/download-engine-browser.js";
import TransferStatistics from "./transfer-visualize/transfer-statistics.js";
import {DownloadFileCLIOnProgress} from "./node-download.js";
import DownloadEngineWriteStreamBrowser
    from "./download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";

export type DownloadFileBrowserOptions = Omit<DownloadEngineOptionsBrowser, "onProgress"> & {
    onProgress?: (info: DownloadFileCLIOnProgress) => any;
};

function isFirefox() {
    try {
        return navigator.userAgent.toLowerCase()
            .indexOf("firefox") > -1;
    } catch {
        return false;
    }
}

/**
 * Download one file in the browser environment.
 */
export function downloadFileBrowser(linkParts: string | string[], options: DownloadFileBrowserOptions) {
    const transfer = new TransferStatistics();

    return DownloadEngineBrowser.fromParts(linkParts, {
        fetchStrategy: isFirefox() ? "xhr" : "fetch",
        ...options,
        onProgress: (status) => {
            const progress = transfer.updateProgress(status.bytesDownloaded, status.totalBytes);
            const update = {...status, ...progress};
            options.onProgress?.(update);
        }
    });
}

/**
 * Download one file in the browser environment and store it in memory (Uint8Array).
 */
export async function downloadFileBrowserMemory(linkParts: string | string[], options: Omit<DownloadFileBrowserOptions, "onWrite"> = {}) {
    const memory = DownloadEngineWriteStreamBrowser.memoryWriter();
    const downloader = await downloadFileBrowser(linkParts, {
        ...options,
        onWrite: memory.writer
    });

    memory.setLength(downloader.file.totalSize);

    return {
        downloader,
        memory
    };
}
