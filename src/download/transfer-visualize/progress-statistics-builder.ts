import {EventEmitter} from "../../utils/EventEmitter.js";
import TransferStatistics from "./transfer-statistics.js";
import {createFormattedStatus, FormattedStatus} from "./format-transfer-status.js";
import DownloadEngineFile from "../download-engine/download-file/download-engine-file.js";
import {DownloadStatus, EMPTY_PROGRESS_STATUS, ProgressStatus} from "../download-engine/download-file/progress-status-file.js";
import DownloadEngineMultiDownload from "../download-engine/engine/download-engine-multi-download.js";
import {BaseDownloadEngine, DownloadEngineRemote} from "../../browser.js";

export type ProgressStatusWithIndex = FormattedStatus & {
    index: number,
};

interface CliProgressBuilderEvents {
    progress: (progress: ProgressStatusWithIndex) => void;
}

export type AnyEngine = DownloadEngineFile | BaseDownloadEngine | DownloadEngineMultiDownload | DownloadEngineRemote;
export default class ProgressStatisticsBuilder extends EventEmitter<CliProgressBuilderEvents> {
    private _engines = new Set<AnyEngine>();
    private _activeTransfers: { [index: number]: number; } = {};
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
    private _commonTransferActionMap: Record<string, number> = {};
    private _commonTransferAction = "";

    constructor() {
        super();
        this.createStatus(0);
    }

    public get downloadStatus() {
        return this._downloadStatus;
    }

    public set downloadStatus(status) {
        if (this._downloadStatus === status) return;

        this._lastStatus.downloadStatus = this._downloadStatus = status;
        if ([DownloadStatus.Finished, DownloadStatus.Cancelled, DownloadStatus.Error].includes(status)) {
            this._endTime = Date.now();
            this._lastStatus = {
                ...this._lastStatus,
                downloadStatus: status,
                endTime: this._endTime
            };
        }
    }

    public emitLastStatus() {
        this.emit1("progress", this._lastStatus);
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

    public add(engine: AnyEngine, sendProgress = false, addFileName = true) {
        if (this._engines.has(engine)) {
            return;
        }

        const latestStatus = engine.status;
        const addFileNameFunc = () => {
            if (addFileName){
                this._allFileNames += this._allFileNames ? ", " + latestStatus.fileName : latestStatus.fileName;
            }
        };

        if (engine instanceof DownloadEngineMultiDownload) {
            addFileNameFunc();

            for (const subEngine of engine._flatEngines) {
                this.add(subEngine, sendProgress, false);
            }

            engine.on("downloadAdded", (subEngine) => {
                this.add(subEngine, sendProgress, false);
            });
            return;
        }

        this._engines.add(engine);
        this._latestEngine = engine;
        this._totalBytes += engine.downloadSize;
        const index = this._engines.size - 1;
        const downloadPartStart = this._totalDownloadParts;
        this._totalDownloadParts += latestStatus.totalDownloadParts;
        this._downloadId += latestStatus.downloadId;
        addFileNameFunc();

        if (latestStatus.downloadStatus === DownloadStatus.Active || this._downloadStatus === null) {
            this._downloadStatus = latestStatus.downloadStatus;
        }

        this._commonTransferActionMap[latestStatus.transferAction] ??= 0;
        this._commonTransferActionMap[latestStatus.transferAction]++;
        this._calcCommonTransferAction();

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

        engine.on("closed", () => {
            this._commonTransferActionMap[latestStatus.transferAction]--;
            this._calcCommonTransferAction();

            delete this._activeTransfers[index];
            this._transferredBytes += engine.downloadSize;
        });

        if (sendProgress && latestStatus.downloadStatus === DownloadStatus.Active) {
            this._sendProgress(latestStatus, index, downloadPartStart);
        }
    }

    private _calcCommonTransferAction() {
        this._commonTransferAction = Object.entries(this._commonTransferActionMap).reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
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

        this.emit1("progress", this.createStatus(index, data));
    }

    private createStatus(index: number, data?: ProgressStatus) {
        const progress = this._statistics.updateProgress(this.transferredBytesWithActiveTransfers, this.totalBytes);
        const optionsForMultiDownload = this._engines.size <= 1 && data ? data : {
            comment: "",
            transferAction: this._commonTransferAction,
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

    static _loadingStatusEmptyStatisticsCache: FormattedStatus | null = null;
    static loadingStatusEmptyStatistics() {
        return this._loadingStatusEmptyStatisticsCache ??= createFormattedStatus({
            ...EMPTY_PROGRESS_STATUS,
            ...TransferStatistics.oneStatistics(0, 0)
        });
    }
}
