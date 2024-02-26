import BaseDownloadEngine from "../download-engine/engine/base-download-engine.js";
import Emittery from "emittery";
import TransferStatistics, {TransferProgressInfo} from "./transfer-statistics.js";
import ProgressStatusFile from "../download-engine/progress-status-file.js";
import DownloadEngineFile from "../download-engine/download-engine-file.js";
import DownloadEngineMultiDownload from "../download-engine/engine/download-engine-multi-download.js";

export type TransferProgressWithStatus = Omit<ProgressStatusFile, "createStatus"> & TransferProgressInfo & { index: number };

interface CliProgressBuilderEvents {
    progress: TransferProgressWithStatus;
}

export type AnyEngines = DownloadEngineFile | BaseDownloadEngine | DownloadEngineMultiDownload;
export default class ProgressStatisticsBuilder extends Emittery<CliProgressBuilderEvents> {
    protected _engines: AnyEngines[] = [];
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

    public add(...engines: AnyEngines[]) {
        for (const engine of engines) {
            this._initEvents(engine);
        }
    }

    protected _initEvents(engine: AnyEngines) {
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
