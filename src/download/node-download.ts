import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download-engine/engine/download-engine-nodejs.js";
import TransferCli from "./transfer-visualize/transfer-cli.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import DownloadEngineMultiDownload from "./download-engine/engine/download-engine-multi-download.js";

export type DownloadEngineOptionsCLI = DownloadEngineOptionsNodejs & {
    truncateName?: boolean | number;
    cliProgress?: boolean | TransferCli;
    cliName?: string;
    cliAction?: string;
};

/**
 * Download one file with CLI progress
 */
export async function downloadFile(options: DownloadEngineOptionsCLI) {
    const downloader = await DownloadEngineNodejs.createFromOptions(options);

    if (options.cliProgress) {
        options.cliAction ??= options.fetchStrategy === "localFile" ? "Copying" : "Downloading";

        const cli = options.cliProgress instanceof TransferCli ? options.cliProgress : new TransferCli({
            ...options,
            action: options.cliAction,
            name: options.cliName
        });

        downloader.on("progress", cli.updateProgress);
    }

    return downloader;
}

export type DownloadSequenceOptions = {
    truncateName?: boolean | number;
    cliProgress?: boolean | TransferCli;
    cliName?: string;
    cliAction?: string;
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

    const allDownloads = await Promise.all(downloads);
    const oneDownloader = new DownloadEngineMultiDownload(allDownloads);

    if (downloadOptions.cliProgress) {
        if (downloadOptions.fetchStrategy) {
            downloadOptions.cliAction ??= downloadOptions.fetchStrategy === "localFile" ? "Copying" : "Downloading";
        } else {
            downloadOptions.cliAction ??= "Transferring";
        }

        const cli = downloadOptions.cliProgress instanceof TransferCli ? downloadOptions.cliProgress : new TransferCli({
            ...options,
            action: downloadOptions.cliAction,
            name: downloadOptions.cliName
        });

        oneDownloader.on("progress", progress => {
            cli.updateProgress({
                ...progress,
                comment: `${progress.index + 1}/${allDownloads.length}`
            });
        });
    }

    return oneDownloader;
}
