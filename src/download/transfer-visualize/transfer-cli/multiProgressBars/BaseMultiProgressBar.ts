import {TransferCliProgressBar} from "../progress-bars/base-transfer-cli-progress-bar.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";
import chalk from "chalk";
import prettyBytes from "pretty-bytes";
import cliSpinners from "cli-spinners";

export type MultiProgressBarOptions = {
    maxViewDownloads: number;
    createProgressBar: TransferCliProgressBar
    loadingAnimation: cliSpinners.SpinnerName,
};

export type CLIProgressPrintType = "update" | "log";

export class BaseMultiProgressBar {
    public readonly updateIntervalMs: null | number = null;
    public readonly printType: CLIProgressPrintType = "update";


    public constructor(protected options: MultiProgressBarOptions) {
    }

    protected createProgresses(statuses: FormattedStatus[]): string {
        return statuses.map((status) => this.options.createProgressBar.createStatusLine(status))
            .join("\n");
    }

    /**
     * Sorts the statuses by importance, active downloads first, then remaining, then finished (by end time - latest first)
     */
    protected recorderStatusByImportance(statuses: FormattedStatus[]) {
        const activeTasks = statuses.filter(status => status.downloadStatus === DownloadStatus.Active);
        const remaining = statuses.filter(status => [DownloadStatus.Paused, DownloadStatus.NotStarted].includes(status.downloadStatus));
        const loading = statuses.filter(status => status.downloadStatus === DownloadStatus.Loading);
        const finishedTasks = statuses.filter(status => status.downloadStatus === DownloadStatus.Finished)
            .sort((a, b) => b.endTime - a.endTime);

        const showTotalTasks = activeTasks.concat(remaining)
            .concat(loading);
        const showTotalTasksWithFinished = showTotalTasks.concat(finishedTasks);

        return {
            notFinished: showTotalTasks.length > 0,
            remaining: remaining.length + loading.length,
            allStatusesSorted: showTotalTasksWithFinished
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createMultiProgressBar(statuses: FormattedStatus[], oneStatus: FormattedStatus, loadingDownloads = 0) {
        if (statuses.length < this.options.maxViewDownloads - Math.min(loadingDownloads, 1)) {
            return this.createProgresses(statuses);
        }

        const {notFinished, remaining, allStatusesSorted} = this.recorderStatusByImportance(statuses);
        const tasksLogs = this.createProgresses(allStatusesSorted.slice(0, this.options.maxViewDownloads));

        if (notFinished) {
            return tasksLogs + `\nand ${chalk.gray((remaining + loadingDownloads).toLocaleString())} more out of ${chalk.blueBright(statuses.length.toLocaleString())} downloads.`;
        }

        const totalSize = allStatusesSorted.reduce((acc, status) => acc + status.totalBytes, 0);
        return tasksLogs + `\n${chalk.green(`All ${statuses.length.toLocaleString()} downloads (${prettyBytes(totalSize)}) finished.`)}`;
    }
}
