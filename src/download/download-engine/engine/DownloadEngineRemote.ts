import {BaseDownloadEngineEvents} from "./base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import {FormattedStatus} from "../../transfer-visualize/format-transfer-status.js";
import {DownloadStatus} from "../download-file/progress-status-file.js";
import ProgressStatisticsBuilder from "../../transfer-visualize/progress-statistics-builder.js";

export class DownloadEngineRemote extends EventEmitter<BaseDownloadEngineEvents> {
    /**
     * @internal
     */
    _downloadEndPromise = Promise.withResolvers<void>();
    /**
     * @internal
     */
    _downloadStarted = false;

    private _latestStatus: FormattedStatus = ProgressStatisticsBuilder.loadingStatusEmptyStatistics();

    public get status() {
        return this._latestStatus!;
    }

    public get downloadStatues() {
        return [this.status];
    }

    public get downloadSize() {
        return this._latestStatus?.totalBytes ?? 0;
    }

    public get fileName() {
        return this._latestStatus?.fileName ?? "";
    }

    public download() {
        return this._downloadEndPromise.promise;
    }

    public emitRemoteProgress(progress: FormattedStatus) {
        this._latestStatus = progress;
        this.emit("progress", progress);
        const isStatusChanged = this._latestStatus?.downloadStatus !== progress.downloadStatus;

        if (!isStatusChanged) {
            return;
        }

        switch (progress.downloadStatus) {
            case DownloadStatus.Active:
                if (this._latestStatus?.downloadStatus === DownloadStatus.Paused) {
                    this.emit("resumed");
                } else {
                    this.emit("start");
                    this._downloadStarted = true;
                }
                break;
            case DownloadStatus.Finished:
            case DownloadStatus.Cancelled:
                this.emit("finished");
                this.emit("closed");
                this._downloadEndPromise.resolve();
                break;
            case DownloadStatus.Paused:
                this.emit("paused");
                break;
        }

        if (progress.downloadStatus === DownloadStatus.Active) {
            this.emit("start");
        }
    }
}
