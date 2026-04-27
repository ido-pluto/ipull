import {BaseMultiProgressBar, CLIProgressPrintType} from "./BaseMultiProgressBar.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadFlags, DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";

export class SummaryMultiProgressBar extends BaseMultiProgressBar {
    public override readonly printType: CLIProgressPrintType = "update";
    public override readonly updateIntervalMs: number = 0;
    private _parallelDownloads = 0;
    private _lastStatusByDownloadId = new Map<string, DownloadStatus>();

    override createMultiProgressBar(statuses: FormattedStatus[], oneStatus: FormattedStatus, loadingDownloads = 0) {
        const linesToPrint: FormattedStatus[] = [];
        let activeDownloads = 0;
        let finishedDownloads = 0;

        for (const status of statuses) {
            if (status.downloadStatus === DownloadStatus.Active) {
                activeDownloads++;
            } else if (status.downloadStatus === DownloadStatus.Finished) {
                finishedDownloads++;
            }

            if (this._lastStatusByDownloadId.get(status.downloadId) !== status.downloadStatus) {
                linesToPrint.push(status);
            }
        }

        if (this.printType === "log") {
            this._lastStatusByDownloadId.clear();
            for (const status of statuses) {
                this._lastStatusByDownloadId.set(status.downloadId, status.downloadStatus);
            }
        }

        const {allStatusesSorted} = this.recorderStatusByImportance(linesToPrint);
        const filterStatusesSliced = allStatusesSorted.slice(0, this.options.maxViewDownloads);

        this._parallelDownloads ||= activeDownloads;
        const aggregateStatus = {
            ...oneStatus,
            comment: `${finishedDownloads.toLocaleString()}/${(statuses.length + loadingDownloads).toLocaleString()} files done${this._parallelDownloads > 1 ? ` (${activeDownloads.toLocaleString()} active)` : ""}`,
            downloadFlags: oneStatus.downloadFlags.concat([DownloadFlags.DownloadSequence])
        };

        if (statuses.length > 1 || aggregateStatus.downloadStatus === DownloadStatus.Active) {
            filterStatusesSliced.push(aggregateStatus);
        }

        return this.createProgresses(filterStatusesSliced);
    }
}
