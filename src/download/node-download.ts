import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download-engine/engine/download-engine-nodejs.js";
import TransferCli, {CustomOutput, TransferCliOptions} from "./transfer-visualize/transfer-cli/transfer-cli.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import DownloadEngineMultiDownload from "./download-engine/engine/download-engine-multi-download.js";
import transferCliSwitch, {AvailableTransferCli} from "./transfer-visualize/transfer-cli/transfer-cli-switch.js";


export type CliProgressDownloadEngineOptions = {
    truncateName?: boolean | number;
    cliProgress?: boolean | CustomOutput;
    cliStyle?: AvailableTransferCli;
    cliName?: string;
    cliAction?: string;
};

export type DownloadEngineOptionsCLI = DownloadEngineOptionsNodejs & CliProgressDownloadEngineOptions;

function createCliProgressForDownloadEngine(options: CliProgressDownloadEngineOptions) {
    const cliOptions: TransferCliOptions = {...options};

    if (options.cliAction) {
        cliOptions.action = options.cliAction;
    }
    if (options.cliName) {
        cliOptions.name = options.cliName;
    }

    if (typeof options.cliProgress === "function") {
        return TransferCli.customFormat(options.cliProgress);
    }

    return transferCliSwitch(options.cliStyle, cliOptions);
}

/**
 * Download one file with CLI progress
 */
export async function downloadFile(options: DownloadEngineOptionsCLI) {
    const downloader = await DownloadEngineNodejs.createFromOptions(options);

    if (options.cliProgress) {
        options.cliAction ??= options.fetchStrategy === "localFile" ? "Copying" : "Downloading";

        const cli = createCliProgressForDownloadEngine(options);

        downloader.on("progress", cli.updateProgress);
    }

    return downloader;
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

    const allDownloads = await Promise.all(downloads);
    const oneDownloader = new DownloadEngineMultiDownload(allDownloads);

    if (downloadOptions.cliProgress) {
        if (downloadOptions.fetchStrategy) {
            downloadOptions.cliAction ??= downloadOptions.fetchStrategy === "localFile" ? "Copying" : "Downloading";
        }

        const cli = createCliProgressForDownloadEngine(downloadOptions);
        oneDownloader.on("progress", progress => {
            cli.updateProgress({
                ...progress,
                comment: `${progress.index + 1}/${allDownloads.length}`
            });
        });
    }

    return oneDownloader;
}
