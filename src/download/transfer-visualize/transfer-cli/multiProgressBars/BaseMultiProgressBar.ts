import {TransferCliProgressBar} from "../progress-bars/base-transfer-cli-progress-bar.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";
import ansis from "ansis";
import {SpinnerName} from "cli-spinners";
import prettyBytes from "../../utils/prettyBytesFast.js";

export type MultiProgressBarOptions = {
    maxViewDownloads: number;
    createProgressBar: TransferCliProgressBar
    loadingAnimation: SpinnerName,
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
        const activeTasks: FormattedStatus[] = [];
        const remaining: FormattedStatus[] = [];
        const loading: FormattedStatus[] = [];
        const finishedTasks: FormattedStatus[] = [];

        for (const status of statuses) {
            switch (status.downloadStatus) {
                case DownloadStatus.Active:
                    activeTasks.push(status);
                    break;
                case DownloadStatus.Paused:
                case DownloadStatus.NotStarted:
                    remaining.push(status);
                    break;
                case DownloadStatus.Loading:
                    loading.push(status);
                    break;
                case DownloadStatus.Finished:
                    finishedTasks.push(status);
                    break;
            }
        }

        finishedTasks.sort((a, b) => b.endTime - a.endTime);

        const showTotalTasks = activeTasks.concat(remaining, loading);
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
            return tasksLogs + `\nand ${ansis.gray((remaining + loadingDownloads).toLocaleString())} more out of ${ansis.blueBright(statuses.length.toLocaleString())} downloads.`;
        }

        const totalSize = allStatusesSorted.reduce((acc, status) => acc + status.totalBytes, 0);
        return tasksLogs + `\n${ansis.green(`All ${statuses.length.toLocaleString()} downloads (${prettyBytes(totalSize)}) finished.`)}`;
    }
}
