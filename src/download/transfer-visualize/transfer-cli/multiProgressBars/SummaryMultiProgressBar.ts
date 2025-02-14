import {BaseMultiProgressBar, CLIProgressPrintType} from "./BaseMultiProgressBar.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadFlags, DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";

export class SummaryMultiProgressBar extends BaseMultiProgressBar {
    public override readonly printType: CLIProgressPrintType = "update";
    public override readonly updateIntervalMs: number = 0;
    private _parallelDownloads = 0;
    private _lastStatuses: FormattedStatus[] = [];

    override createMultiProgressBar(statuses: FormattedStatus[], oneStatus: FormattedStatus, loadingDownloads = 0) {
        oneStatus = structuredClone(oneStatus);
        oneStatus.downloadFlags.push(DownloadFlags.DownloadSequence);

        const linesToPrint: FormattedStatus[] = [];

        for (const status of statuses) {
            const lastStatus = this._lastStatuses.find(x => x.downloadId === status.downloadId);
            const isStatusChanged = lastStatus?.downloadStatus !== status.downloadStatus;
            const copyStatus = structuredClone(status);

            if (isStatusChanged) {
                linesToPrint.push(copyStatus);
            }
        }

        if (this.printType === "log") {
            this._lastStatuses = structuredClone(statuses);
        }

        const {allStatusesSorted} = this.recorderStatusByImportance(linesToPrint);
        const filterStatusesSliced = allStatusesSorted.slice(0, this.options.maxViewDownloads);

        if (statuses.length > 1 || oneStatus.downloadStatus === DownloadStatus.Active) {
            filterStatusesSliced.push(oneStatus);
        }

        const activeDownloads = statuses.filter((status) => status.downloadStatus === DownloadStatus.Active).length;
        this._parallelDownloads ||= activeDownloads;
        const finishedDownloads = statuses.filter((status) => status.downloadStatus === DownloadStatus.Finished).length;
        oneStatus.comment = `${finishedDownloads.toLocaleString()}/${(statuses.length + loadingDownloads).toLocaleString()} files done${this._parallelDownloads > 1 ? ` (${activeDownloads.toLocaleString()} active)` : ""}`;

        return this.createProgresses(filterStatusesSliced);
    }
}
