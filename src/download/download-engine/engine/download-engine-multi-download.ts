import {EventEmitter} from "eventemitter3";
import {FormattedStatus} from "../../transfer-visualize/format-transfer-status.js";
import ProgressStatisticsBuilder, {ProgressStatusWithIndex} from "../../transfer-visualize/progress-statistics-builder.js";
import BaseDownloadEngine, {BaseDownloadEngineEvents} from "./base-download-engine.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";
import {concurrency} from "./utils/concurrency.js";

const DEFAULT_PARALLEL_DOWNLOADS = 1;

type DownloadEngineMultiAllowedEngines = BaseDownloadEngine;

type DownloadEngineMultiDownloadEvents<Engine = DownloadEngineMultiAllowedEngines> = BaseDownloadEngineEvents & {
    childDownloadStarted: (engine: Engine) => void
    childDownloadClosed: (engine: Engine) => void
};

export type DownloadEngineMultiDownloadOptions = {
    parallelDownloads?: number
};

export default class DownloadEngineMultiDownload<Engine extends DownloadEngineMultiAllowedEngines = DownloadEngineMultiAllowedEngines> extends EventEmitter<DownloadEngineMultiDownloadEvents> {
    public readonly downloads: Engine[];
    public readonly options: DownloadEngineMultiDownloadOptions;
    protected _aborted = false;
    protected _activeEngines = new Set<Engine>();
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();
    protected _downloadStatues: (ProgressStatusWithIndex | FormattedStatus)[] = [];
    protected _closeFiles: (() => Promise<void>)[] = [];


    protected constructor(engines: (DownloadEngineMultiAllowedEngines | DownloadEngineMultiDownload)[], options: DownloadEngineMultiDownloadOptions) {
        super();
        this.downloads = DownloadEngineMultiDownload._extractEngines(engines);
        this.options = options;
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
            this._downloadStatues[numberIndex] = engine.status;
            engine.on("progress", (progress) => {
                this._downloadStatues[numberIndex] = progress;
            });
        }

        this._progressStatisticsBuilder.add(...this.downloads);
        this._progressStatisticsBuilder.on("progress", progress => {
            this.emit("progress", progress);
        });
    }

    public async download(): Promise<void> {
        if (this._activeEngines.size) {
            throw new DownloadAlreadyStartedError();
        }

        this.emit("start");

        const concurrencyCount = this.options.parallelDownloads ?? DEFAULT_PARALLEL_DOWNLOADS;
        await concurrency(this.downloads, concurrencyCount, async (engine) => {
            if (this._aborted) return;
            this._activeEngines.add(engine);

            this.emit("childDownloadStarted", engine);
            await engine.download();
            this.emit("childDownloadClosed", engine);

            this._activeEngines.delete(engine);
        });

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
        this._activeEngines.forEach(engine => engine.pause());
    }

    public resume(): void {
        this._activeEngines.forEach(engine => engine.resume());
    }

    public async close() {
        if (this._aborted) return;
        this._aborted = true;

        const closePromises = Array.from(this._activeEngines)
            .map(engine => engine.close());
        await Promise.all(closePromises);
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

    public static async fromEngines<Engine extends DownloadEngineMultiAllowedEngines>(engines: (Engine | Promise<Engine>)[], options: DownloadEngineMultiDownloadOptions = {}) {
        return new DownloadEngineMultiDownload(await Promise.all(engines), options);
    }
}
