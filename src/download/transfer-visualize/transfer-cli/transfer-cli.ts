import UpdateManager from "stdout-update";
import debounce from "lodash.debounce";
import {CliFormattedStatus} from "./progress-bars/base-transfer-cli-progress-bar.js";
import cliSpinners from "cli-spinners";
import CliSpinnersLoadingAnimation from "./loading-animation/cli-spinners-loading-animation.js";
import {FormattedStatus} from "../format-transfer-status.js";
import switchCliProgressStyle from "./progress-bars/switch-cli-progress-style.js";

export type TransferCliOptions = {
    action?: string,
    name?: string,
    truncateName: boolean | number;
    debounceWait: number;
    maxDebounceWait: number;
    createProgressBar: (status: CliFormattedStatus) => string;
    loadingAnimation: cliSpinners.SpinnerName,
    loadingText?: string;
};

export const DEFAULT_TRANSFER_CLI_OPTIONS: TransferCliOptions = {
    truncateName: true,
    debounceWait: 20,
    maxDebounceWait: 100,
    createProgressBar: switchCliProgressStyle("basic", {truncateName: true}),
    loadingAnimation: "dots",
    loadingText: "Gathering information"
};

export enum CLI_LEVEL {
    LOW = 0,
    HIGH = 2
}


export default class TransferCli {
    public static activeCLILevel = CLI_LEVEL.LOW;
    public readonly loadingAnimation: CliSpinnersLoadingAnimation;
    protected options: TransferCliOptions;
    protected stdoutManager = UpdateManager.getInstance();
    protected myCLILevel: number;
    protected latestProgress: FormattedStatus[] = [];
    private _cliStopped = true;
    private readonly _updateStatuesDebounce: () => void;

    public constructor(options: Partial<TransferCliOptions>, myCLILevel = CLI_LEVEL.LOW) {
        TransferCli.activeCLILevel = this.myCLILevel = myCLILevel;
        this.options = {...DEFAULT_TRANSFER_CLI_OPTIONS, ...options};

        this._updateStatuesDebounce = debounce(this._updateStatues.bind(this), this.options.debounceWait, {
            maxWait: this.options.maxDebounceWait
        });

        this.loadingAnimation = new CliSpinnersLoadingAnimation(cliSpinners[this.options.loadingAnimation], {
            loadingText: this.options.loadingText
        });
        this._processExit = this._processExit.bind(this);
    }

    start() {
        if (this.myCLILevel !== TransferCli.activeCLILevel) return;
        this._cliStopped = false;
        this.stdoutManager.hook();
        process.on("SIGINT", this._processExit);
    }

    stop() {
        if (this._cliStopped || this.myCLILevel !== TransferCli.activeCLILevel) return;
        this._updateStatues();
        this._cliStopped = true;
        this.stdoutManager.unhook(false);
        process.off("SIGINT", this._processExit);
    }

    private _processExit() {
        this.stop();
        process.exit(0);
    }

    updateStatues(statues: FormattedStatus[]) {
        this.latestProgress = statues;
        this._updateStatuesDebounce();
    }

    private _updateStatues() {
        if (this._cliStopped || this.myCLILevel !== TransferCli.activeCLILevel) {
            return; // Do not update if there is a higher level CLI, meaning that this CLI is sub-CLI
        }
        const newLog = this.latestProgress.map((status) => {
            status.transferAction = this.options.action ?? status.transferAction;
            return this.options.createProgressBar(status);
        })
            .join("\n");
        this._logUpdate(newLog);
    }

    protected _logUpdate(text: string) {
        this.stdoutManager.update(text.split("\n"));
    }
}
