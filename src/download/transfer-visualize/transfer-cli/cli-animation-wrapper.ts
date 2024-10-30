import DownloadEngineNodejs from "../../download-engine/engine/download-engine-nodejs.js";
import DownloadEngineMultiDownload from "../../download-engine/engine/download-engine-multi-download.js";
import switchCliProgressStyle, {AvailableCLIProgressStyle} from "./progress-bars/switch-cli-progress-style.js";
import {CliFormattedStatus} from "./progress-bars/base-transfer-cli-progress-bar.js";
import TransferCli, {CLI_LEVEL, TransferCliOptions} from "./transfer-cli.js";
import {BaseMultiProgressBar} from "./multiProgressBars/BaseMultiProgressBar.js";
import cliSpinners from "cli-spinners";

const DEFAULT_CLI_STYLE: AvailableCLIProgressStyle = "auto";
type AllowedDownloadEngines = DownloadEngineNodejs | DownloadEngineMultiDownload;

export type CliProgressDownloadEngineOptions = {
    truncateName?: boolean | number;
    cliProgress?: boolean;
    maxViewDownloads?: number;
    createMultiProgressBar?: typeof BaseMultiProgressBar,
    cliStyle?: AvailableCLIProgressStyle | ((status: CliFormattedStatus) => string)
    cliName?: string;
    cliAction?: string;
    fetchStrategy?: "localFile" | "fetch";
    loadingAnimation?: cliSpinners.SpinnerName;
    /** @internal */
    cliLevel?: CLI_LEVEL;
};

export default class CliAnimationWrapper {
    private readonly _downloadEngine: Promise<AllowedDownloadEngines>;
    private readonly _options: CliProgressDownloadEngineOptions;
    private _activeCLI?: TransferCli;

    public constructor(downloadEngine: Promise<AllowedDownloadEngines>, _options: CliProgressDownloadEngineOptions) {
        this._options = _options;
        this._downloadEngine = downloadEngine;
        this._init();
    }

    private _init() {
        if (!this._options.cliProgress) {
            return;
        }
        this._options.cliAction ??= this._options.fetchStrategy === "localFile" ? "Copying" : "Downloading";

        const cliOptions: Partial<TransferCliOptions> = {...this._options};
        if (this._options.cliAction) {
            cliOptions.action = this._options.cliAction;
        }
        if (this._options.cliName) {
            cliOptions.name = this._options.cliName;
        }

        cliOptions.createProgressBar = typeof this._options.cliStyle === "function" ?
            {
                createStatusLine: this._options.cliStyle,
                multiProgressBar: this._options.createMultiProgressBar ?? BaseMultiProgressBar
            } :
            switchCliProgressStyle(this._options.cliStyle ?? DEFAULT_CLI_STYLE, {
                truncateName: this._options.truncateName,
                loadingSpinner: this._options.loadingAnimation
            });

        this._activeCLI = new TransferCli(cliOptions, this._options.cliLevel);
    }

    public async attachAnimation() {
        if (!this._activeCLI) {
            return;
        }
        this._activeCLI.loadingAnimation.start();

        try {
            const engine = await this._downloadEngine;
            this._activeCLI.loadingAnimation.stop();

            engine.once("start", () => {
                this._activeCLI?.start();

                engine.on("progress", (progress) => {
                    this._activeCLI?.updateStatues(engine.downloadStatues, progress);
                });

                engine.on("closed", () => {
                    this._activeCLI?.stop();
                });
            });
        } finally {
            this._activeCLI.loadingAnimation.stop();
        }
    }
}
