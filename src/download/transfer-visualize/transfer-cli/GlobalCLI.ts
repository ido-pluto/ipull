import DownloadEngineMultiDownload, {DownloadEngineMultiAllowedEngines} from "../../download-engine/engine/download-engine-multi-download.js";
import TransferCli, {TransferCliOptions} from "./transfer-cli.js";
import {BaseMultiProgressBar} from "./multiProgressBars/BaseMultiProgressBar.js";
import switchCliProgressStyle, {AvailableCLIProgressStyle} from "./progress-bars/switch-cli-progress-style.js";
import {CliFormattedStatus} from "./progress-bars/base-transfer-cli-progress-bar.js";
import cliSpinners from "cli-spinners";
import {DownloadStatus} from "../../download-engine/download-file/progress-status-file.js";
import BaseDownloadEngine from "../../download-engine/engine/base-download-engine.js";
import {DownloadEngineRemote} from "../../download-engine/engine/DownloadEngineRemote.js";

type AllowedDownloadEngine = DownloadEngineMultiDownload | BaseDownloadEngine | DownloadEngineRemote;

const DEFAULT_CLI_STYLE: AvailableCLIProgressStyle = "auto";

export type CliProgressDownloadEngineOptions = {
    truncateName?: boolean | number;
    cliProgress?: boolean;
    maxViewDownloads?: number;
    createMultiProgressBar?: typeof BaseMultiProgressBar,
    cliStyle?: AvailableCLIProgressStyle | ((status: CliFormattedStatus) => string)
    cliName?: string;
    loadingAnimation?: cliSpinners.SpinnerName;
};

class GlobalCLI {
    private _multiDownloadEngine = this._createMultiDownloadEngine();
    private _transferCLI = GlobalCLI._createOptions({});
    private _cliActive = false;
    private _downloadOptions = new WeakMap<AllowedDownloadEngine, CliProgressDownloadEngineOptions>();

    constructor() {
        this._registerCLIEvents();
    }

    async addDownload(engine: AllowedDownloadEngine | Promise<AllowedDownloadEngine>, cliOptions: CliProgressDownloadEngineOptions = {}) {
        if (!this._cliActive && cliOptions.cliProgress) {
            this._transferCLI = GlobalCLI._createOptions(cliOptions);
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
            parallelDownloads: Number.MAX_VALUE
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
            if (!isDownloadActive()) {
                this._transferCLI.stop();
                this._cliActive = false;
            }
        };

        const checkResumeCLI = (engine: DownloadEngineMultiAllowedEngines) => {
            if (engine.status.downloadStatus === DownloadStatus.Active) {
                this._transferCLI.start();
                this._cliActive = true;
            }
        };

        this._multiDownloadEngine.on("start", () => {
            this._transferCLI.start();
            this._cliActive = true;
        });

        this._multiDownloadEngine.on("finished", () => {
            this._transferCLI.stop();
            this._cliActive = false;
            this._multiDownloadEngine = this._createMultiDownloadEngine();
        });

        this._multiDownloadEngine.on("childDownloadStarted", function registerEngineStatus(engine) {
            engine.on("closed", checkPauseCLI);
            engine.on("paused", checkPauseCLI);
            engine.on("resumed", () => checkResumeCLI(engine));

            if (engine instanceof DownloadEngineMultiDownload) {
                engine.on("childDownloadStarted", registerEngineStatus);
            }
        });

        const getCLIEngines = (multiEngine: DownloadEngineMultiDownload) => {
            const enginesToShow: AllowedDownloadEngine[] = [];
            for (const engine of multiEngine.activeDownloads) {
                const isShowEngine = this._downloadOptions.get(engine)?.cliProgress;
                if (engine instanceof DownloadEngineMultiDownload) {
                    if (isShowEngine) {
                        enginesToShow.push(...engine._flatEngines);
                        continue;
                    }
                    enginesToShow.push(...getCLIEngines(engine));
                } else if (isShowEngine) {
                    enginesToShow.push(engine);
                }
            }

            return enginesToShow.filter((engine, index, self) => self.indexOf(engine) === index);
        };

        this._multiDownloadEngine.on("progress", (progress) => {
            if (!this._cliActive) return;
            const statues = getCLIEngines(this._multiDownloadEngine)
                .map(x => x.status);
            this._transferCLI.updateStatues(statues, progress, this._multiDownloadEngine.loadingDownloads);
        });
    }

    private static _createOptions(options: CliProgressDownloadEngineOptions) {
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
        return new TransferCli(cliOptions);
    }
}

export const globalCLI = new GlobalCLI();
