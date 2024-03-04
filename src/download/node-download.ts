import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download-engine/engine/download-engine-nodejs.js";
import BaseDownloadEngine from "./download-engine/engine/base-download-engine.js";
import DownloadEngineMultiDownload from "./download-engine/engine/download-engine-multi-download.js";
import TransferCli, {TransferCliOptions} from "./transfer-visualize/transfer-cli/transfer-cli.js";
import switchCliProgressStyle, {AvailableCLIProgressStyle} from "./transfer-visualize/transfer-cli/progress-bars/switch-cli-progress-style.js";
import {CliFormattedStatus} from "./transfer-visualize/transfer-cli/progress-bars/base-transfer-cli-progress-bar.js";

export type CliProgressDownloadEngineOptions = {
    truncateName?: boolean | number;
    cliProgress?: boolean;
    cliStyle?: AvailableCLIProgressStyle | ((status: CliFormattedStatus) => string)
    cliName?: string;
    cliAction?: string;
};

export type DownloadFileOptions = DownloadEngineOptionsNodejs & CliProgressDownloadEngineOptions;

function createCliProgressForDownloadEngine(options: CliProgressDownloadEngineOptions) {
    const cliOptions: Partial<TransferCliOptions> = {...options};

    if (options.cliAction) {
        cliOptions.action = options.cliAction;
    }
    if (options.cliName) {
        cliOptions.name = options.cliName;
    }

    if (options.cliStyle) {
        cliOptions.createProgressBar = typeof options.cliStyle === "function" ?
            options.cliStyle :
            switchCliProgressStyle(options.cliStyle);
    }

    return new TransferCli(cliOptions);
}

/**
 * Download one file with CLI progress
 */
export async function downloadFile(options: DownloadFileOptions) {
    let cli: TransferCli | undefined;
    if (options.cliProgress) {
        options.cliAction ??= options.fetchStrategy === "localFile" ? "Copying" : "Downloading";

        cli = createCliProgressForDownloadEngine(options);
        cli.loadingAnimation.start();
    }


    const downloader = await DownloadEngineNodejs.createFromOptions(options);

    cli?.loadingAnimation.stop();
    downloader.on("progress", () => {
        cli?.updateStatues([downloader.status]);
    });

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

    let cli: TransferCli | undefined;
    if (downloadOptions.cliProgress) {
        if (downloadOptions.fetchStrategy) {
            downloadOptions.cliAction ??= downloadOptions.fetchStrategy === "localFile" ? "Copying" : "Downloading";
        }

        cli = createCliProgressForDownloadEngine(downloadOptions);
        cli.loadingAnimation.start();

    }

    const allDownloads = await Promise.all(downloads);
    const oneDownloader = new DownloadEngineMultiDownload(allDownloads);

    cli?.loadingAnimation.stop();
    oneDownloader.on("progress", () => {
        cli?.updateStatues(oneDownloader.downloadStatues);
    });

    return oneDownloader;
}
