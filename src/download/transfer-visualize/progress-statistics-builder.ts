import BaseDownloadEngine from "../download-engine/engine/base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import TransferStatistics from "./transfer-statistics.js";
import DownloadEngineMultiDownload from "../download-engine/engine/download-engine-multi-download.js";
import {createFormattedStatus, FormattedStatus} from "./format-transfer-status.js";
import DownloadEngineFile from "../download-engine/download-file/download-engine-file.js";

export type ProgressStatusWithIndex = FormattedStatus & {
    index: number,
};

interface CliProgressBuilderEvents {
    progress: (progress: ProgressStatusWithIndex) => void;
}

export type AnyEngine = DownloadEngineFile | BaseDownloadEngine | DownloadEngineMultiDownload;
export default class ProgressStatisticsBuilder extends EventEmitter<CliProgressBuilderEvents> {
    protected _engines: AnyEngine[] = [];
    protected _activeTransfers: { [index: number]: number } = {};
    protected _totalBytes = 0;
    protected _transferredBytes = 0;
    protected statistics = new TransferStatistics();

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

    protected _initEvents(engine: AnyEngine) {
        this._engines.push(engine);
        this._totalBytes += engine.downloadSize;
        const index = this._engines.length - 1;

        engine.on("progress", (data) => {
            this._activeTransfers[index] = data.transferredBytes;
            const progress = this.statistics.updateProgress(this.transferredBytesWithActiveTransfers, this.totalBytes);

            this.emit("progress", {
                ...createFormattedStatus({
                    ...data,
                    ...progress
                }),
                index
            });
        });

        engine.on("finished", () => {
            delete this._activeTransfers[index];
            this._transferredBytes += engine.downloadSize;
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
