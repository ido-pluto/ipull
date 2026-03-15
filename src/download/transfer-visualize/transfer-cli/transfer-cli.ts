import UpdateManager from "stdout-update";
import { TransferCliProgressBar } from "./progress-bars/base-transfer-cli-progress-bar.js";
import cliSpinners from "cli-spinners";
import { FormattedStatus } from "../format-transfer-status.js";
import switchCliProgressStyle from "./progress-bars/switch-cli-progress-style.js";
import { BaseMultiProgressBar } from "./multiProgressBars/BaseMultiProgressBar.js";

export type TransferCliOptions = {
    name?: string,
    maxViewDownloads: number;
    truncateName: boolean | number;
    debounceWait: number;
    createProgressBar: TransferCliProgressBar;
    createMultiProgressBar: typeof BaseMultiProgressBar,
    loadingAnimation: cliSpinners.SpinnerName,
};

export const DEFAULT_TRANSFER_CLI_OPTIONS: TransferCliOptions = {
    maxViewDownloads: 10,
    truncateName: true,
    debounceWait: process.platform === "win32" ? 500 : 45,
    createProgressBar: switchCliProgressStyle("auto", {truncateName: true}),
    loadingAnimation: "dots",
    createMultiProgressBar: BaseMultiProgressBar
};

export default class TransferCli {
    protected options: TransferCliOptions;
    protected stdoutManager = UpdateManager.getInstance();
    protected latestProgress: [FormattedStatus[], FormattedStatus, number] = null!;
    protected latestProgressGetter: (() => [FormattedStatus[], FormattedStatus, number]) | null = null;
    private _cliStopped = true;
    private _multiProgressBar: BaseMultiProgressBar;
    private _lastProgressLong = "";
    private _lastUpdateTime = 0;
    private _shouldExitOnSIGINT = false;
    private _debounceWait: number

    public constructor(options: Partial<TransferCliOptions>) {
        this.options = { ...DEFAULT_TRANSFER_CLI_OPTIONS, ...options };
        this._multiProgressBar = new this.options.createProgressBar.multiProgressBar(this.options);
        this._debounceWait = this._multiProgressBar.updateIntervalMs || this.options.debounceWait;

        this.updateStatues = this.updateStatues.bind(this);
        this._processExit = this._processExit.bind(this);
    }

    start() {
        if (!this._cliStopped) return;
        this._cliStopped = false;
        if (this._multiProgressBar.printType === "update") {
            this.stdoutManager.hook();
        }
        
        this._shouldExitOnSIGINT = process.listenerCount("SIGINT") === 0;
        process.on("SIGINT", this._processExit);
    }

    stop() {
        if (this._cliStopped) return;
        this._cliStopped = true;
        if (this._multiProgressBar.printType === "update") {
            this.stdoutManager.unhook(false);
        }
        process.off("SIGINT", this._processExit);
    }

    private _processExit() {
        this.stop();

        if (this._shouldExitOnSIGINT) {
            process.exit(0);
        }
    }

    updateStatues(getLatestProgress: () => [FormattedStatus[], FormattedStatus, number], debounce = true) {
        this.latestProgressGetter = getLatestProgress;

        if(debounce && Date.now() - this._lastUpdateTime < this._debounceWait) {
            return;
        }
        
        this._lastUpdateTime = Date.now();
        this._updateStatues();
    }

    private _updateStatues() {
        const latestProgress = this.latestProgressGetter?.() ?? this.latestProgress;
        if (!latestProgress) return;
        const printLog = this._multiProgressBar.createMultiProgressBar(...latestProgress);
        if (printLog && this._lastProgressLong != printLog) {
            this._lastProgressLong = printLog;
            this._logUpdate(printLog);
        }
    }

    protected _logUpdate(text: string) {
        if (this._multiProgressBar.printType === "update") {
            this.stdoutManager.update(text.split("\n"));
        } else {
            console.log(text);
        }
    }
}
