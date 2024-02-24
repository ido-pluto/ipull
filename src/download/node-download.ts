import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download-engine/engine/download-engine-nodejs.js";
import TransferCli from "./transfer-visualize/transfer-cli.js";
import TransferStatistics, {TransferProgressInfo} from "./transfer-visualize/transfer-statistics.js";
import ProgressStatusFile from "./download-engine/progress-status-file.js";

export type DownloadFileCLIOnProgress = TransferProgressInfo & Omit<ProgressStatusFile, "createStatus">;
export type DownloadEngineOptionsCLI = Omit<Partial<DownloadEngineOptionsNodejs>, "onProgress"> & {
    onProgress?: (info: DownloadFileCLIOnProgress) => any;
    truncateName?: boolean | number;
    cliProgress?: boolean;
    cliAction?: string;
};

const DEFAULT_OPTIONS: DownloadEngineOptionsCLI = {
    truncateName: true,
    cliProgress: true,
    cliAction: "Downloading"
};

export function downloadCliOptions(options: DownloadEngineOptionsCLI = {}) {
    options = {...DEFAULT_OPTIONS, ...options};
    const cli = new TransferCli({
        action: options.cliAction,
        truncateName: options.truncateName,
        name: options.fileName
    });

    const transfer = new TransferStatistics();
    const newOptions: Partial<DownloadEngineOptionsNodejs> = {
        ...options,
        onProgress: (status) => {
            const progress = transfer.updateProgress(status.bytesDownloaded, status.totalBytes);
            const update = {...status, ...progress};

            options.onProgress?.(update);
            if (options.cliProgress) {
                cli.updateProgress(update);
            }
        }
    };

    return newOptions;
}

/**
 * Download one file with CLI progress
 */
export async function downloadFile(linkParts: string | string[], options?: DownloadEngineOptionsCLI) {
    return await DownloadEngineNodejs.fromParts(linkParts, downloadCliOptions(options));
}

/**
 * Copy one file with CLI progress
 */
export async function copyFile(pathParts: string | string[], options: DownloadEngineOptionsCLI = {}) {
    options.cliAction ??= "Copying";
    return await DownloadEngineNodejs.copyLocalFile(pathParts, downloadCliOptions(options));
}
