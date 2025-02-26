import BaseDownloadEngine from "../download-engine/engine/base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import TransferStatistics from "./transfer-statistics.js";
import {createFormattedStatus, FormattedStatus} from "./format-transfer-status.js";
import DownloadEngineFile from "../download-engine/download-file/download-engine-file.js";
import ProgressStatusFile, {DownloadStatus, ProgressStatus} from "../download-engine/download-file/progress-status-file.js";
import DownloadEngineMultiDownload from "../download-engine/engine/download-engine-multi-download.js";
import {DownloadEngineRemote} from "../download-engine/engine/DownloadEngineRemote.js";

export type ProgressStatusWithIndex = FormattedStatus & {
    index: number,
};

interface CliProgressBuilderEvents {
    progress: (progress: ProgressStatusWithIndex) => void;
}

export type AnyEngine = DownloadEngineFile | BaseDownloadEngine | DownloadEngineMultiDownload | DownloadEngineRemote;
export default class ProgressStatisticsBuilder extends EventEmitter<CliProgressBuilderEvents> {
    private _engines = new Set<AnyEngine>();
    private _activeTransfers: { [index: number]: number } = {};
    private _totalBytes = 0;
    private _transferredBytes = 0;
    private _latestEngine: AnyEngine | null = null;
    /**
     * @internal
     */
    _totalDownloadParts = 0;
    private _activeDownloadPart = 0;
    private _startTime = 0;
    private _statistics = new TransferStatistics();
    private _lastStatus: ProgressStatusWithIndex = null!;
    private _downloadStatus: DownloadStatus = null!;
    private _endTime = 0;
    private _downloadId = "";
    private _allFileNames = "";
    private _retrying = 0;
    private _retryingTotalAttempts = 0;
    private _streamsNotResponding = 0;

    constructor() {
        super();
        this.createStatus(0);
    }

    public get downloadStatus() {
        return this._downloadStatus;
    }

    public set downloadStatus(status) {
        if (this._downloadStatus === status) return;

        this._downloadStatus = status;
        if ([DownloadStatus.Finished, DownloadStatus.Cancelled, DownloadStatus.Error].includes(status)) {
            this._endTime = Date.now();
            this._lastStatus = {
                ...this._lastStatus,
                endTime: this._endTime
            };
        }

        this.emit("progress", this._lastStatus);
    }

    public get totalBytes() {
        return this._totalBytes;
    }

    public get transferredBytesWithActiveTransfers() {
        return this._transferredBytes + Object.values(this._activeTransfers)
            .reduce((acc, bytes) => acc + bytes, 0);
    }

    public get status() {
        return this._lastStatus;
    }

    public add(engine: AnyEngine, sendProgress = true) {
        const latestStatus = engine.status;

        this._engines.add(engine);
        this._latestEngine = engine;
        this._totalBytes += engine.downloadSize;
        const index = this._engines.size - 1;
        const downloadPartStart = this._totalDownloadParts;
        this._totalDownloadParts += latestStatus.totalDownloadParts;
        this._downloadId += latestStatus.downloadId;
        this._allFileNames += this._allFileNames ? ", " + latestStatus.fileName : latestStatus.fileName;

        if (latestStatus.downloadStatus === DownloadStatus.Active || this._downloadStatus === null) {
            this._downloadStatus = latestStatus.downloadStatus;
        }

        let lastRetrying = 0;
        let lastRetryingTotalAttempts = 0;
        let lastStreamsNotResponding = 0;
        engine.on("progress", (data) => {
            const retrying = Number(data.retrying);
            this._retrying += retrying - lastRetrying;
            lastRetrying = retrying;

            this._retryingTotalAttempts += data.retryingTotalAttempts - lastRetryingTotalAttempts;
            lastRetryingTotalAttempts = data.retryingTotalAttempts;

            this._streamsNotResponding += data.streamsNotResponding - lastStreamsNotResponding;
            lastStreamsNotResponding = data.streamsNotResponding;

            this._sendProgress(data, index, downloadPartStart);
        });

        engine.on("finished", () => {
            delete this._activeTransfers[index];
            this._transferredBytes += engine.downloadSize;
        });

        if (sendProgress) {
            this._sendProgress(latestStatus, index, downloadPartStart);
        }
    }

    /**
     * @internal
     */
    _sendLatestProgress() {
        if (!this._latestEngine) return;
        const engine = this._latestEngine;
        const status = engine.status;
        this._sendProgress(status, this._engines.size - 1, this._totalDownloadParts - status.totalDownloadParts);
    }


    private _sendProgress(data: ProgressStatus, index: number, downloadPartStart: number) {
        this._startTime ||= data.startTime;
        this._activeTransfers[index] = data.transferredBytes;
        if (downloadPartStart + data.downloadPart > this._activeDownloadPart) {
            this._activeDownloadPart = downloadPartStart + data.downloadPart;
        }

        this.emit("progress", this.createStatus(index, data));
    }

    private createStatus(index: number, data?: ProgressStatus) {
        const progress = this._statistics.updateProgress(this.transferredBytesWithActiveTransfers, this.totalBytes);
        const optionsForMultiDownload = this._engines.size <= 1 && data ? data : {
            comment: "",
            transferAction: "Transferring",
            downloadStatus: this._downloadStatus,
            endTime: this._endTime,
            downloadFlags: []
        };

        return this._lastStatus = {
            ...createFormattedStatus({
                ...optionsForMultiDownload,
                ...progress,
                downloadId: this._downloadId,
                downloadPart: this._activeDownloadPart,
                totalDownloadParts: this._totalDownloadParts,
                startTime: this._startTime,
                fileName: this._allFileNames,
                retrying: this._retrying > 0,
                retryingTotalAttempts: this._retryingTotalAttempts,
                streamsNotResponding: this._streamsNotResponding
            }),
            index
        };
    }

    static oneStatistics(engine: DownloadEngineFile) {
        const progress = engine.status;
        const statistics = TransferStatistics.oneStatistics(progress.transferredBytes, progress.totalBytes);

        return createFormattedStatus({
            ...progress,
            ...statistics
        });
    }

    static loadingStatusEmptyStatistics() {
        const statistics = TransferStatistics.oneStatistics(0, 0);
        const status = new ProgressStatusFile(0, "???");
        status.downloadStatus = DownloadStatus.Loading;

        return createFormattedStatus({
            ...status,
            ...statistics
        });
    }
}
