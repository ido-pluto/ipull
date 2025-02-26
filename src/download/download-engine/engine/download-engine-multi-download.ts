import {EventEmitter} from "eventemitter3";
import {FormattedStatus} from "../../transfer-visualize/format-transfer-status.js";
import ProgressStatisticsBuilder from "../../transfer-visualize/progress-statistics-builder.js";
import BaseDownloadEngine, {BaseDownloadEngineEvents} from "./base-download-engine.js";
import {concurrency} from "../utils/concurrency.js";
import {DownloadFlags, DownloadStatus} from "../download-file/progress-status-file.js";
import {DownloadEngineRemote} from "./DownloadEngineRemote.js";

export type DownloadEngineMultiAllowedEngines = BaseDownloadEngine | DownloadEngineRemote | DownloadEngineMultiDownload<any>;

type DownloadEngineMultiDownloadEvents<Engine = DownloadEngineMultiAllowedEngines> = BaseDownloadEngineEvents & {
    childDownloadStarted: (engine: Engine) => void
    childDownloadClosed: (engine: Engine) => void
    downloadAdded: (engine: Engine) => void
};

export type DownloadEngineMultiDownloadOptions = {
    parallelDownloads?: number
    /**
     * Unpack inner downloads statues to the main download statues,
     * useful for showing CLI progress in separate downloads or tracking download progress separately
     */
    unpackInnerMultiDownloadsStatues?: boolean
    /**
     * Finalize download (change .ipull file to original extension) after all downloads are settled
     */
    finalizeDownloadAfterAllSettled?: boolean

    /**
     * Do not start download automatically
     * @internal
     */
    naturalDownloadStart?: boolean

    downloadName?: string
    downloadComment?: string
};

const DEFAULT_OPTIONS = {
    parallelDownloads: 1,
    unpackInnerMultiDownloadsStatues: true,
    finalizeDownloadAfterAllSettled: true
} satisfies DownloadEngineMultiDownloadOptions;

export default class DownloadEngineMultiDownload<Engine extends DownloadEngineMultiAllowedEngines = DownloadEngineMultiAllowedEngines> extends EventEmitter<DownloadEngineMultiDownloadEvents> {
    public readonly downloads: Engine[] = [];
    protected _options: DownloadEngineMultiDownloadOptions;
    protected _aborted = false;
    protected _activeEngines = new Set<Engine>();
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();
    protected _downloadStatues: FormattedStatus[] | FormattedStatus[][] = [];
    protected _closeFiles: (() => Promise<void>)[] = [];
    protected _lastStatus: FormattedStatus = null!;
    protected _loadingDownloads = 0;
    protected _reloadDownloadParallelisms?: () => void;
    protected _engineWaitPromises = new Set<Promise<Engine>>();
    /**
     * @internal
     */
    _downloadEndPromise = Promise.withResolvers<void>();
    /**
     * @internal
     */
    _downloadStarted = false;

    /**
     * @internal
     */
    constructor(options: DownloadEngineMultiDownloadOptions = {}) {
        super();
        this._options = {...DEFAULT_OPTIONS, ...options};
        this._init();
    }

    public get activeDownloads() {
        return Array.from(this._activeEngines);
    }

    public get parallelDownloads() {
        return this._options.parallelDownloads;
    }

    public get loadingDownloads() {
        if (!this._options.unpackInnerMultiDownloadsStatues) {
            return this._loadingDownloads;
        }

        let totalLoading = this._loadingDownloads;
        for (const download of this.downloads) {
            if (download instanceof DownloadEngineMultiDownload) {
                totalLoading += download.loadingDownloads;
            }
        }

        return totalLoading;
    }

    /**
     * @internal
     */
    public get _flatEngines(): Engine[] {
        return this.downloads.map(engine => {
            if (engine instanceof DownloadEngineMultiDownload) {
                return engine._flatEngines;
            }
            return engine;
        })
            .flat();
    }

    public set parallelDownloads(value) {
        if (this._options.parallelDownloads === value) return;
        this._options.parallelDownloads = value;
        this._reloadDownloadParallelisms?.();
    }

    public get downloadStatues() {
        const statues = this._downloadStatues.flat();
        return statues.filter(((status, index) => statues.findIndex(x => x.downloadId === status.downloadId) === index));
    }

    public get status() {
        return this._lastStatus;
    }

    public get downloadSize(): number {
        return this.downloads.reduce((acc, engine) => acc + engine.downloadSize, 0);
    }

    protected _init() {
        this._progressStatisticsBuilder.downloadStatus = DownloadStatus.NotStarted;
        this._progressStatisticsBuilder.on("progress", progress => {
            progress = {
                ...progress,
                fileName: this._options.downloadName ?? progress.fileName,
                comment: this._options.downloadComment ?? progress.comment,
                downloadFlags: progress.downloadFlags.concat([DownloadFlags.DownloadSequence])
            };
            this._lastStatus = progress;
            this.emit("progress", progress);
        });

        const originalProgress = this._progressStatisticsBuilder.status;
        this._lastStatus = {
            ...originalProgress,
            downloadFlags: originalProgress.downloadFlags.concat([DownloadFlags.DownloadSequence])
        };
    }

    private _addEngine(engine: Engine, index: number) {
        this.emit("downloadAdded", engine);
        const getStatus = (defaultProgress = engine.status) =>
            (this._options.unpackInnerMultiDownloadsStatues && engine instanceof DownloadEngineMultiDownload ? engine.downloadStatues : defaultProgress);

        this._downloadStatues[index] = getStatus();
        engine.on("progress", (progress) => {
            this._downloadStatues[index] = getStatus(progress);
        });

        if (this._options.finalizeDownloadAfterAllSettled) {
            this._changeEngineFinishDownload(engine);
        }
        this._reloadDownloadParallelisms?.();
    }

    public async _addDownloadNoStatisticUpdate(engine: Engine | Promise<Engine>) {
        const index = this.downloads.length + this._loadingDownloads;
        this._downloadStatues[index] = ProgressStatisticsBuilder.loadingStatusEmptyStatistics();

        this._loadingDownloads++;
        this._progressStatisticsBuilder._totalDownloadParts++;
        this._progressStatisticsBuilder._sendLatestProgress();

        const isPromise = engine instanceof Promise;
        if (isPromise) {
            this._engineWaitPromises.add(engine);
        }
        const awaitEngine = isPromise ? await engine : engine;
        if (isPromise) {
            this._engineWaitPromises.delete(engine);
        }
        this._progressStatisticsBuilder._totalDownloadParts--;
        this._loadingDownloads--;

        this._addEngine(awaitEngine, index);
        this.downloads.push(awaitEngine);
        this._progressStatisticsBuilder.add(awaitEngine, true);

        return awaitEngine;
    }

    public async addDownload(...engines: (Engine | Promise<Engine>)[]) {
        await Promise.all(engines.map(this._addDownloadNoStatisticUpdate.bind(this)));
    }

    public async download(): Promise<void> {
        if (this._downloadStarted) {
            return this._downloadEndPromise.promise;
        }

        try {
            this._progressStatisticsBuilder.downloadStatus = DownloadStatus.Active;
            this._downloadStarted = true;
            this.emit("start");

            const concurrencyCount = this._options.parallelDownloads || DEFAULT_OPTIONS.parallelDownloads;
            let continueIteration = true;
            while (this._loadingDownloads > 0 || continueIteration) {
                continueIteration = false;
                const {reload, promise} = concurrency(this.downloads, concurrencyCount, async (engine) => {
                    if (this._aborted) return;
                    this._activeEngines.add(engine);

                    this.emit("childDownloadStarted", engine);
                    if (engine._downloadStarted || this._options.naturalDownloadStart) {
                        await engine._downloadEndPromise.promise;
                    } else {
                        await engine.download();
                    }
                    this.emit("childDownloadClosed", engine);

                    this._activeEngines.delete(engine);
                });
                this._reloadDownloadParallelisms = reload;
                await promise;
                continueIteration = this._engineWaitPromises.size > 0;
                await Promise.race(this._engineWaitPromises);
            }

            this._downloadEndPromise = Promise.withResolvers();
            this._progressStatisticsBuilder.downloadStatus = DownloadStatus.Finished;
            this.emit("finished");
            await this._finishEnginesDownload();
            await this.close();
            this._downloadEndPromise.resolve();
        } catch (error) {
            this._downloadEndPromise.reject(error);
            throw error;
        }
    }

    private _changeEngineFinishDownload(engine: Engine) {
        if (engine instanceof DownloadEngineMultiDownload) {
            const _finishEnginesDownload = engine._finishEnginesDownload.bind(engine);
            engine._finishEnginesDownload = async () => {
            };
            this._closeFiles.push(_finishEnginesDownload);
            return;
        }

        if (!(engine instanceof BaseDownloadEngine)) {
            return;
        }

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

    private async _finishEnginesDownload() {
        await Promise.all(this._closeFiles.map(func => func()));
    }

    public pause(): void {
        this._progressStatisticsBuilder.downloadStatus = DownloadStatus.Paused;
        this._activeEngines.forEach(engine => {
            if ("pause" in engine) engine.pause();
        });
    }

    public resume(): void {
        this._progressStatisticsBuilder.downloadStatus = DownloadStatus.Active;
        this._activeEngines.forEach(engine => {
            if ("resume" in engine) engine.resume();
        });
    }

    public async close() {
        if (this._aborted) return;
        this._aborted = true;

        if (this._progressStatisticsBuilder.downloadStatus !== DownloadStatus.Finished) {
            this._progressStatisticsBuilder.downloadStatus = DownloadStatus.Cancelled;
        }

        const closePromises = Array.from(this._activeEngines)
            .map(engine => {
                if ("close" in engine) {
                    return engine.close();
                }
                return Promise.resolve();
            });
        await Promise.all(closePromises);

        this.emit("closed");
    }
}
