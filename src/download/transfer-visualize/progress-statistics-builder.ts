import BaseDownloadEngine from "../download-engine/engine/base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import TransferStatistics, {TransferProgressInfo} from "./transfer-statistics.js";
import DownloadEngineFile from "../download-engine/download-engine-file.js";
import DownloadEngineMultiDownload from "../download-engine/engine/download-engine-multi-download.js";

export type TransferProgressWithStatus = TransferProgressInfo & {
    totalBytes: number,
    totalDownloadParts: number,
    fileName: string,
    comment?: string,
    downloadPart: number,
    bytesDownloaded: number,
    index: number
};

interface CliProgressBuilderEvents {
    progress: (progress: TransferProgressWithStatus) => void;
}

export type AnyEngine = DownloadEngineFile | BaseDownloadEngine | DownloadEngineMultiDownload;
export default class ProgressStatisticsBuilder extends EventEmitter<CliProgressBuilderEvents> {
    protected _engines: AnyEngine[] = [];
    protected _activeTransfers: { [index: number]: number } = {};
    protected _totalBytes = 0;
    protected _bytesDownloaded = 0;
    protected statistics = new TransferStatistics();

    public get totalBytes() {
        return this._totalBytes;
    }

    public get bytesDownloadedWithActiveTransfers() {
        return this._bytesDownloaded + Object.values(this._activeTransfers)
            .reduce((acc, bytes) => acc + bytes, 0);
    }

    public add(...engines: AnyEngine[]) {
        for (const engine of engines) {
            this._initEvents(engine);
        }
    }

    protected _initEvents(engine: AnyEngine) {
        this._engines.push(engine);
        this._totalBytes += engine.fileSize;
        const index = this._engines.length - 1;

        engine.on("progress", (data) => {
            this._activeTransfers[index] = data.bytesDownloaded;
            const progress = this.statistics.updateProgress(this.bytesDownloadedWithActiveTransfers, this.totalBytes);

            this.emit("progress", {
                ...data,
                ...progress,
                index
            });
        });

        engine.on("finished", () => {
            delete this._activeTransfers[index];
            this._bytesDownloaded += engine.fileSize;
        });
    }
}
