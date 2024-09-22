import BaseDownloadEngine from "../download-engine/engine/base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import TransferStatistics from "./transfer-statistics.js";
import {createFormattedStatus, FormattedStatus} from "./format-transfer-status.js";
import DownloadEngineFile from "../download-engine/download-file/download-engine-file.js";
import {DownloadStatus, ProgressStatus} from "../download-engine/download-file/progress-status-file.js";

export type ProgressStatusWithIndex = FormattedStatus & {
    index: number,
};

interface CliProgressBuilderEvents {
    progress: (progress: ProgressStatusWithIndex) => void;
}

export type AnyEngine = DownloadEngineFile | BaseDownloadEngine;
export default class ProgressStatisticsBuilder extends EventEmitter<CliProgressBuilderEvents> {
    private _engines: AnyEngine[] = [];
    private _activeTransfers: { [index: number]: number } = {};
    private _totalBytes = 0;
    private _transferredBytes = 0;
    private _totalDownloadParts = 0;
    private _activeDownloadPart = 0;
    private _startTime = 0;
    private statistics = new TransferStatistics();
    public downloadStatus: DownloadStatus = null!;

    public get totalBytes() {
        return this._totalBytes;
    }


    public get transferredBytesWithActiveTransfers() {
        return this._transferredBytes + Object.values(this._activeTransfers)
            .reduce((acc, bytes) => acc + bytes, 0);
    }

    public add(...engines: AnyEngine[]) {
        for (const engine of engines) {
            this._initEvents(engine);
        }
    }

    private _initEvents(engine: AnyEngine) {
        this._engines.push(engine);
        this._totalBytes += engine.downloadSize;
        const index = this._engines.length - 1;
        const downloadPartStart = this._totalDownloadParts;
        this._totalDownloadParts += engine.status.totalDownloadParts;

        engine.on("progress", (data) => {
            this._sendProgress(data, index, downloadPartStart);
        });

        engine.on("finished", () => {
            delete this._activeTransfers[index];
            this._transferredBytes += engine.downloadSize;
        });
    }


    private _sendProgress(data: ProgressStatus, index: number, downloadPartStart: number) {
        this._startTime ||= data.startTime;
        this._activeTransfers[index] = data.transferredBytes;
        if (downloadPartStart + data.downloadPart > this._activeDownloadPart) {
            this._activeDownloadPart = downloadPartStart + data.downloadPart;
        }

        const progress = this.statistics.updateProgress(this.transferredBytesWithActiveTransfers, this.totalBytes);
        const activeDownloads = Object.keys(this._activeTransfers).length;

        this.emit("progress", {
            ...createFormattedStatus({
                ...progress,
                downloadPart: this._activeDownloadPart,
                totalDownloadParts: this._totalDownloadParts,
                startTime: this._startTime,
                fileName: data.fileName,
                comment: data.comment,
                transferAction: data.transferAction,
                downloadStatus: this.downloadStatus || data.downloadStatus,
                endTime: activeDownloads <= 1 ? data.endTime : 0,
                downloadFlags: data.downloadFlags
            }),
            index
        });
    }

    static oneStatistics(engine: DownloadEngineFile) {
        const progress = engine.status;
        const statistics = TransferStatistics.oneStatistics(progress.transferredBytes, progress.totalBytes);

        return createFormattedStatus({
            ...progress,
            ...statistics
        });
    }
}
