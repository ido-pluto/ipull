import {BaseDownloadEngineEvents} from "./base-download-engine.js";
import Emittery from "emittery";
import ProgressStatisticsBuilder, {AnyEngine} from "../../transfer-visualize/progress-statistics-builder.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";

interface DownloadEngineMultiDownloadEvents<Engine = AnyEngine> extends BaseDownloadEngineEvents {
    childDownloadStarted: Engine;
    childDownloadClosed: Engine;
}

export default class DownloadEngineMultiDownload<Engine extends AnyEngine = AnyEngine> extends Emittery<DownloadEngineMultiDownloadEvents> {
    protected _aborted = false;
    protected _activeEngine?: Engine;
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();

    get fileSize(): number {
        return this._engines.reduce((acc, engine) => acc + engine.fileSize, 0);
    }

    public constructor(protected readonly _engines: Engine[]) {
        super();
        this._initEvents();
    }

    protected _initEvents() {
        this._progressStatisticsBuilder.add(...this._engines);
        this._progressStatisticsBuilder.on("progress", progress => {
            this.emit("progress", progress);
        });
    }

    async download(): Promise<void> {
        if (this._activeEngine) {
            throw new DownloadAlreadyStartedError();
        }

        await this.emit("start");
        for (const engine of this._engines) {
            if (this._aborted) return;
            this._activeEngine = engine;

            await this.emit("childDownloadStarted", engine);
            await engine.download();
            await this.emit("childDownloadClosed", engine);
        }
        await this.emit("finished");
        await this.close();
    }

    pause(): void {
        this._activeEngine?.pause();
    }

    resume(): void {
        this._activeEngine?.resume();
    }

    async close() {
        if (this._aborted) return;
        this._aborted = true;
        await this._activeEngine?.close();
        await this.emit("closed");
    }
}
