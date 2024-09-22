import {BaseMultiProgressBar, CLIProgressPrintType} from "./BaseMultiProgressBar.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";

export class SummaryMultiProgressBar extends BaseMultiProgressBar {
    public override readonly printType: CLIProgressPrintType = "update";
    public override readonly updateIntervalMs: number = 0;
    private _parallelDownloads = 0;
    private _lastStatuses: FormattedStatus[] = [];

    override createMultiProgressBar(statuses: FormattedStatus[], oneStatus: FormattedStatus) {
        const linesToPrint: FormattedStatus[] = [];

        let index = 0;
        for (const status of statuses) {
            const isStatusChanged = this._lastStatuses[index++]?.downloadStatus !== status.downloadStatus;
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

        filterStatusesSliced.push(oneStatus);

        const activeDownloads = statuses.filter((status) => status.downloadStatus === DownloadStatus.Active).length;
        this._parallelDownloads ||= activeDownloads;
        const finishedDownloads = statuses.filter((status) => status.downloadStatus === DownloadStatus.Finished).length;
        oneStatus.comment = `${finishedDownloads}/${statuses.length} files done${this._parallelDownloads > 1 ? ` (${activeDownloads} active)` : ""}`;

        return this.createProgresses(filterStatusesSliced);
    }
}
