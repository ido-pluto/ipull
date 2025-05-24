import UpdateManager from "stdout-update";
import {TransferCliProgressBar} from "./progress-bars/base-transfer-cli-progress-bar.js";
import cliSpinners from "cli-spinners";
import {FormattedStatus} from "../format-transfer-status.js";
import switchCliProgressStyle from "./progress-bars/switch-cli-progress-style.js";
import {BaseMultiProgressBar} from "./multiProgressBars/BaseMultiProgressBar.js";
import {abortableDebounce} from "../utils/abortableDebounce.js";

export type TransferCliOptions = {
    name?: string,
    maxViewDownloads: number;
    truncateName: boolean | number;
    debounceWait: number;
    maxDebounceWait: number;
    createProgressBar: TransferCliProgressBar;
    createMultiProgressBar: typeof BaseMultiProgressBar,
    loadingAnimation: cliSpinners.SpinnerName,
};

export const DEFAULT_TRANSFER_CLI_OPTIONS: TransferCliOptions = {
    maxViewDownloads: 10,
    truncateName: true,
    debounceWait: 20,
    maxDebounceWait: process.platform === "win32" ? 500 : 100,
    createProgressBar: switchCliProgressStyle("auto", {truncateName: true}),
    loadingAnimation: "dots",
    createMultiProgressBar: BaseMultiProgressBar
};

export default class TransferCli {
    protected options: TransferCliOptions;
    protected stdoutManager = UpdateManager.getInstance();
    protected latestProgress: [FormattedStatus[], FormattedStatus, number] = null!;
    private _cliStopped = true;
    private _updateStatuesDebounce: () => void = this._updateStatues;
    private _abortDebounce = new AbortController();
    private _multiProgressBar: BaseMultiProgressBar;
    public isFirstPrint = true;
    private _lastProgressLong = "";

    public constructor(options: Partial<TransferCliOptions>) {
        this.options = {...DEFAULT_TRANSFER_CLI_OPTIONS, ...options};
        this._multiProgressBar = new this.options.createProgressBar.multiProgressBar(this.options);

        this._updateStatues = this._updateStatues.bind(this);
        this._processExit = this._processExit.bind(this);
        this._resetDebounce();
    }

    private _resetDebounce() {
        const maxDebounceWait = this._multiProgressBar.updateIntervalMs || this.options.maxDebounceWait;
        this._abortDebounce = new AbortController();
        this._updateStatuesDebounce = abortableDebounce(this._updateStatues.bind(this), {
            wait: maxDebounceWait,
            signal: this._abortDebounce.signal
        });
    }

    start() {
        if (!this._cliStopped) return;
        this._cliStopped = false;
        if (this._multiProgressBar.printType === "update") {
            this.stdoutManager.hook();
        }
        process.on("SIGINT", this._processExit);
    }

    stop() {
        if (this._cliStopped) return;
        this._cliStopped = true;
        this._updateStatues();
        if (this._multiProgressBar.printType === "update") {
            this.stdoutManager.unhook(false);
        }
        process.off("SIGINT", this._processExit);
        this._abortDebounce.abort();
        this._resetDebounce();
    }

    private _processExit() {
        this.stop();
        process.exit(0);
    }

    updateStatues(statues: FormattedStatus[], oneStatus: FormattedStatus, loadingDownloads = 0) {
        this.latestProgress = [statues, oneStatus, loadingDownloads];

        if (this.isFirstPrint) {
            this.isFirstPrint = false;
            this._updateStatues();
        } else {
            this._updateStatuesDebounce();
        }
    }

    private _updateStatues() {
        if (!this.latestProgress) return;
        const printLog = this._multiProgressBar.createMultiProgressBar(...this.latestProgress);
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
