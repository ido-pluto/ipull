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


export default class TransferCli {
    protected readonly loadingAnimation: CliSpinnersLoadingAnimation;
    protected options: TransferCliOptions;
    protected stdoutManager = UpdateManager.getInstance();

    public constructor(options: Partial<TransferCliOptions>) {
        this.options = {...DEFAULT_TRANSFER_CLI_OPTIONS, ...options};

        this.updateStatues = debounce(this.updateStatues.bind(this), this.options.debounceWait, {
            maxWait: this.options.maxDebounceWait
        });

        this.loadingAnimation = new CliSpinnersLoadingAnimation(cliSpinners[this.options.loadingAnimation], {
            loadingText: this.options.loadingText
        });
        this.stop = this.stop.bind(this);
    }

    startLoading() {
        this.loadingAnimation.start();
    }

    start() {
        this.loadingAnimation.stop();
        this.stdoutManager.hook();
        process.on("exit", this.stop);
    }

    stop() {
        this.stdoutManager.erase();
        this.stdoutManager.unhook(false);
        process.off("exit", this.stop);
    }

    public updateStatues(statues: FormattedStatus[]) {
        const newLog = statues.map((status) => {
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
