import {SpinnerName} from "cli-spinners";
import {DownloadStatus} from "../../download-engine/download-file/progress-status-file.js";
import BaseDownloadEngine from "../../download-engine/engine/base-download-engine.js";
import DownloadEngineMultiDownload, {DownloadEngineMultiAllowedEngines} from "../../download-engine/engine/download-engine-multi-download.js";
import {DownloadEngineRemote} from "../../download-engine/engine/DownloadEngineRemote.js";
import {BaseMultiProgressBar} from "./multiProgressBars/BaseMultiProgressBar.js";
import {CliFormattedStatus} from "./progress-bars/base-transfer-cli-progress-bar.js";
import switchCliProgressStyle, {AvailableCLIProgressStyle} from "./progress-bars/switch-cli-progress-style.js";
import TransferCli, {TransferCliOptions} from "./transfer-cli.js";

type AllowedDownloadEngine = DownloadEngineMultiDownload | BaseDownloadEngine | DownloadEngineRemote;

const DEFAULT_CLI_STYLE: AvailableCLIProgressStyle = "auto";

export type CliProgressDownloadEngineOptions = {
    truncateName?: boolean | number;
    cliProgress?: boolean;
    maxViewDownloads?: number;
    createMultiProgressBar?: typeof BaseMultiProgressBar,
    cliStyle?: AvailableCLIProgressStyle | ((status: CliFormattedStatus) => string);
    cliName?: string;
    loadingAnimation?: SpinnerName;
};

class GlobalCLI {
    private _multiDownloadEngine = this._createMultiDownloadEngine();
    private _eventsRegistered = new Set<DownloadEngineMultiAllowedEngines>();
    private _transferCLI = GlobalCLI._createOptions({}, this);
    private _cliActive = false;
    private _downloadOptions = new WeakMap<AllowedDownloadEngine, CliProgressDownloadEngineOptions>();
    private _cachedCliEngines: AllowedDownloadEngine[] = [];
    private _isCliEnginesCacheDirty = true;

    constructor() {
        this._registerCLIEvents();
        this._getCLIStatuses = this._getCLIStatuses.bind(this);
    }

    async addDownload(engine: AllowedDownloadEngine | Promise<AllowedDownloadEngine>, cliOptions: CliProgressDownloadEngineOptions = {}) {
        if (!this._cliActive && cliOptions.cliProgress) {
            this._transferCLI = GlobalCLI._createOptions(cliOptions, this);
        }

        if (engine instanceof Promise) {
            engine.then((engine) => this._downloadOptions.set(engine, cliOptions));
        } else {
            this._downloadOptions.set(engine, cliOptions);
        }

        await this._multiDownloadEngine.addDownload(engine);
        this._multiDownloadEngine.download();
    }

    private _createMultiDownloadEngine() {
        return new DownloadEngineMultiDownload({
            unpackInnerMultiDownloadsStatues: true,
            finalizeDownloadAfterAllSettled: false,
            naturalDownloadStart: true,
            parallelDownloads: Number.MAX_VALUE,
            downloadName: "Global CLI"
        });
    }

    private _registerCLIEvents() {
        const isDownloadActive = (parentEngine: DownloadEngineMultiDownload = this._multiDownloadEngine) => {
            if (parentEngine.loadingDownloads > 0) {
                return true;
            }

            for (const engine of parentEngine.activeDownloads) {
                if (engine instanceof DownloadEngineMultiDownload) {
                    if (isDownloadActive(engine)) {
                        return true;
                    }
                }

                if (engine.status.downloadStatus === DownloadStatus.Active || parentEngine.status.downloadStatus === DownloadStatus.Active && [DownloadStatus.Loading, DownloadStatus.NotStarted].includes(engine.status.downloadStatus)) {
                    return true;
                }
            }

            return false;
        };

        const checkPauseCLI = () => {
            if (this._cliActive && !isDownloadActive()) {
                this._transferCLI.stop();
                this._cliActive = false;
            }
        };

        const checkCloseCLI = (engine: DownloadEngineMultiAllowedEngines) => {
            this._eventsRegistered.delete(engine);
            checkPauseCLI();
        };

        const checkResumeCLI = (engine: DownloadEngineMultiAllowedEngines) => {
            if (engine.status.downloadStatus === DownloadStatus.Active) {
                this._transferCLI.start();
                this._cliActive = true;
            }
        };

        const eventsRegistered = this._eventsRegistered;
        this._multiDownloadEngine.on("childDownloadStarted", function registerEngineStatus(engine) {
            if (eventsRegistered.has(engine)) return;
            eventsRegistered.add(engine);

            checkResumeCLI(engine);
            engine.on("paused", checkPauseCLI);
            engine.on("closed", () => checkCloseCLI(engine));
            engine.on("resumed", () => checkResumeCLI(engine));
            engine.on("start", () => checkResumeCLI(engine));

            if (engine instanceof DownloadEngineMultiDownload) {
                engine.on("childDownloadStarted", registerEngineStatus);
            }
        });


        const invalidateCache = () => this._isCliEnginesCacheDirty = true;
        this._multiDownloadEngine.on("downloadAdded", function onDownloadAdded(engine) {
            if (engine instanceof DownloadEngineMultiDownload) {
                for (const flatEngine of engine._flatEngines) {
                    onDownloadAdded(flatEngine);
                }

                engine.on("downloadAdded", onDownloadAdded);
            }

            invalidateCache();
        });

        this._multiDownloadEngine.on("progress", (progress) => {
            if (!this._cliActive) return;
            this._transferCLI.updateStatues(progress, this._multiDownloadEngine.loadingDownloads);
        });

        this._multiDownloadEngine.on("finished", () => {
            this._multiDownloadEngine = this._createMultiDownloadEngine();
            this._eventsRegistered = new Set();
            this._cachedCliEngines = [];
            this._isCliEnginesCacheDirty = true;
            this._registerCLIEvents();
        });
    }

    private _collectCLIEngines(multiEngine: DownloadEngineMultiDownload, engines: Set<AllowedDownloadEngine>) {
        for (const engine of multiEngine.downloads) {
            const isShowEngine = this._downloadOptions.get(engine)?.cliProgress;
            if (engine instanceof DownloadEngineMultiDownload) {
                if (isShowEngine) {
                    for (const flatEngine of engine._flatEngines) {
                        engines.add(flatEngine);
                    }
                    continue;
                }
                this._collectCLIEngines(engine, engines);
            } else if (isShowEngine) {
                engines.add(engine);
            }
        }
    }

    private _getCLIEngines() {
        if (!this._isCliEnginesCacheDirty) {
            return this._cachedCliEngines;
        }

        const engines = new Set<AllowedDownloadEngine>();
        this._collectCLIEngines(this._multiDownloadEngine, engines);
        this._cachedCliEngines = Array.from(engines);
        this._isCliEnginesCacheDirty = false;

        return this._cachedCliEngines;
    }

    private _getCLIStatuses() {
        return this._getCLIEngines()
            .map(engine => engine.status);
    }

    private static _createOptions(options: CliProgressDownloadEngineOptions, globalCLI: GlobalCLI) {
        const cliOptions: Partial<TransferCliOptions> = {...options};
        cliOptions.createProgressBar ??= typeof options.cliStyle === "function" ?
            {
                createStatusLine: options.cliStyle,
                multiProgressBar: options.createMultiProgressBar ?? BaseMultiProgressBar
            } :
            switchCliProgressStyle(options.cliStyle ?? DEFAULT_CLI_STYLE, {
                truncateName: options.truncateName,
                loadingSpinner: options.loadingAnimation
            });
        const cli = new TransferCli(cliOptions);
        cli.latestProgressesGetter = globalCLI._getCLIStatuses;

        return cli;
    }
}

export const globalCLI = new GlobalCLI();
