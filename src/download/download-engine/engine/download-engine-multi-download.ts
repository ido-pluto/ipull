import BaseDownloadEngine, {BaseDownloadEngineEvents} from "./base-download-engine.js";
import {EventEmitter} from "eventemitter3";
import ProgressStatisticsBuilder, {ProgressStatusWithIndex} from "../../transfer-visualize/progress-statistics-builder.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";
import {createFormattedStatus, FormattedStatus} from "../../transfer-visualize/format-transfer-status.js";

type DownloadEngineMultiAllowedEngines = BaseDownloadEngine;

type DownloadEngineMultiDownloadEvents<Engine = DownloadEngineMultiAllowedEngines> = BaseDownloadEngineEvents & {
    childDownloadStarted: (engine: Engine) => void
    childDownloadClosed: (engine: Engine) => void
};

export default class DownloadEngineMultiDownload<Engine extends DownloadEngineMultiAllowedEngines = DownloadEngineMultiAllowedEngines> extends EventEmitter<DownloadEngineMultiDownloadEvents> {
    public readonly downloads: Engine[];
    protected _aborted = false;
    protected _activeEngine?: Engine;
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();
    protected _downloadStatues: (ProgressStatusWithIndex | FormattedStatus)[] = [];
    protected _closeFiles: (() => Promise<void>)[] = [];


    protected constructor(engines: (DownloadEngineMultiAllowedEngines | DownloadEngineMultiDownload)[]) {
        super();
        this.downloads = DownloadEngineMultiDownload._extractEngines(engines);
        this._init();
    }

    public get downloadStatues() {
        return this._downloadStatues;
    }

    public get downloadSize(): number {
        return this.downloads.reduce((acc, engine) => acc + engine.downloadSize, 0);
    }

    protected _init() {
        this._changeEngineFinishDownload();
        for (const [index, engine] of Object.entries(this.downloads)) {
            const numberIndex = Number(index);
            this._downloadStatues[numberIndex] = createFormattedStatus(engine.status);
            engine.on("progress", (progress) => {
                this._downloadStatues[numberIndex] = createFormattedStatus(progress);
            });
        }

        this._progressStatisticsBuilder.add(...this.downloads);
        this._progressStatisticsBuilder.on("progress", progress => {
            this.emit("progress", progress);
        });
    }

    public async download(): Promise<void> {
        if (this._activeEngine) {
            throw new DownloadAlreadyStartedError();
        }

        this.emit("start");
        for (const engine of this.downloads) {
            if (this._aborted) return;
            this._activeEngine = engine;

            this.emit("childDownloadStarted", engine);
            await engine.download();
            this.emit("childDownloadClosed", engine);
        }
        this.emit("finished");
        await this._finishEnginesDownload();
        await this.close();
    }

    private _changeEngineFinishDownload() {
        for (const engine of this.downloads) {
            const options = engine._fileEngineOptions;
            const onFinishAsync = options.onFinishAsync;
            const onCloseAsync = options.onCloseAsync;

            options.onFinishAsync = undefined;
            options.onCloseAsync = undefined;
            this._closeFiles.push(async () => {
                await onFinishAsync?.();
                await options.writeStream.close();
                await onCloseAsync?.();
            });
        }
    }

    private async _finishEnginesDownload() {
        await Promise.all(this._closeFiles.map(func => func()));
    }

    public pause(): void {
        this._activeEngine?.pause();
    }

    public resume(): void {
        this._activeEngine?.resume();
    }

    public async close() {
        if (this._aborted) return;
        this._aborted = true;
        await this._activeEngine?.close();
        this.emit("closed");

    }

    protected static _extractEngines<Engine>(engines: Engine[]) {
        return engines.map(engine => {
            if (engine instanceof DownloadEngineMultiDownload) {
                return engine.downloads;
            }
            return engine;
        })
            .flat();
    }

    public static async fromEngines<Engine extends DownloadEngineMultiAllowedEngines>(engines: (Engine | Promise<Engine>)[]) {
        return new DownloadEngineMultiDownload(await Promise.all(engines));
    }
}
