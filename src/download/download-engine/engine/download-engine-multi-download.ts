import {BaseDownloadEngineEvents} from "./base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import ProgressStatisticsBuilder, {AnyEngine} from "../../transfer-visualize/progress-statistics-builder.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";

type DownloadEngineMultiDownloadEvents<Engine = AnyEngine> = BaseDownloadEngineEvents & {
    childDownloadStarted: (engine: Engine) => void
    childDownloadClosed: (engine: Engine) => void
};

export default class DownloadEngineMultiDownload<Engine extends AnyEngine = AnyEngine> extends EventEmitter<DownloadEngineMultiDownloadEvents> {
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

        this.emit("start");
        for (const engine of this._engines) {
            if (this._aborted) return;
            this._activeEngine = engine;

            this.emit("childDownloadStarted", engine);
            await engine.download();
            this.emit("childDownloadClosed", engine);
        }
        this.emit("finished");
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
        this.emit("closed");
    }
}
