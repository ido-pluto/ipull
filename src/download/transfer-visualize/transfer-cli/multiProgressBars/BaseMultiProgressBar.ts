import {TransferCliProgressBar} from "../progress-bars/base-transfer-cli-progress-bar.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";
import chalk from "chalk";
import prettyBytes from "pretty-bytes";

export type MultiProgressBarOptions = {
    maxViewDownloads: number;
    createProgressBar: TransferCliProgressBar
    action?: string;
};

export type CLIProgressPrintType = "update" | "log";

export class BaseMultiProgressBar {
    public readonly updateIntervalMs: null | number = null;
    public readonly printType: CLIProgressPrintType = "update";

    public constructor(protected options: MultiProgressBarOptions) {
    }

    protected createProgresses(statuses: FormattedStatus[]): string {
        return statuses.map((status) => {
            status.transferAction = this.options.action ?? status.transferAction;
            return this.options.createProgressBar.createStatusLine(status);
        })
            .join("\n");
    }

    /**
     * Sorts the statuses by importance, active downloads first, then remaining, then finished (by end time - latest first)
     */
    protected recorderStatusByImportance(statuses: FormattedStatus[]) {
        const activeTasks = statuses.filter(status => status.downloadStatus === DownloadStatus.Active);
        const remaining = statuses.filter(status => status.downloadStatus === DownloadStatus.Paused || status.downloadStatus === DownloadStatus.NotStarted);
        const finishedTasks = statuses.filter(status => status.downloadStatus === DownloadStatus.Finished)
            .sort((a, b) => b.endTime - a.endTime);

        const showTotalTasks = activeTasks.concat(remaining);
        const showTotalTasksWithFinished = showTotalTasks.concat(finishedTasks);

        return {
            notFinished: showTotalTasks.length > 0,
            remaining: remaining.length,
            allStatusesSorted: showTotalTasksWithFinished
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createMultiProgressBar(statuses: FormattedStatus[], oneStatus: FormattedStatus) {
        if (statuses.length < this.options.maxViewDownloads) {
            return this.createProgresses(statuses);
        }

        const {notFinished, remaining, allStatusesSorted} = this.recorderStatusByImportance(statuses);
        const tasksLogs = this.createProgresses(allStatusesSorted.slice(0, this.options.maxViewDownloads));

        if (notFinished) {
            return tasksLogs + `\nand ${chalk.gray(remaining)} more out of ${chalk.blueBright(statuses.length)} downloads.`;
        }

        const totalSize = allStatusesSorted.reduce((acc, status) => acc + status.totalBytes, 0);
        return tasksLogs + `\n${chalk.green(`All ${statuses.length} downloads (${prettyBytes(totalSize)}) finished.`)}`;
    }
}
