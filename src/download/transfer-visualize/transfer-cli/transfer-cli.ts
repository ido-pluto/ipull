import logUpdate from "log-update";
import debounce from "lodash.debounce";
import {TRUNCATE_TEXT_MAX_LENGTH, truncateText} from "../utils/cli-text.js";
import {TransferProgressWithStatus} from "../progress-statistics-builder.js";
import BaseTransferCliProgressBar from "./progress-bars/base-transfer-cli-progress-bar.js";
import {ProgressStatus} from "../../download-engine/progress-status-file.js";
import cliSpinners from "cli-spinners";
import CliSpinnersLoadingAnimation from "./loading-animation/cli-spinners-loading-animation.js";

export type TransferCliOptions = {
    action?: string,
    name?: string,
    truncateName: boolean | number;
    debounceWait: number;
    maxDebounceWait: number;
    createProgressBar: (status: ProgressStatus) => string;
    loadingAnimation: cliSpinners.SpinnerName,
    loadingText?: string;
};

export const DEFAULT_TRANSFER_CLI_OPTIONS: TransferCliOptions = {
    truncateName: true,
    debounceWait: 20,
    maxDebounceWait: 100,
    createProgressBar: BaseTransferCliProgressBar.create,
    loadingAnimation: "dots",
    loadingText: "Gathering information"
};


export default class TransferCli {
    public readonly loadingAnimation: CliSpinnersLoadingAnimation;
    protected options: TransferCliOptions;

    public constructor(options: Partial<TransferCliOptions>) {
        this.options = {...DEFAULT_TRANSFER_CLI_OPTIONS, ...options};

        this._logUpdate = debounce(this._logUpdate.bind(this), this.options.debounceWait, {
            maxWait: this.options.maxDebounceWait
        });

        this.loadingAnimation = new CliSpinnersLoadingAnimation(cliSpinners[this.options.loadingAnimation], {
            loadingText: this.options.loadingText
        });
    }

    public updateStatues(statues: (TransferProgressWithStatus | ProgressStatus)[]) {
        const newLog = statues.map((status) => {
            status.fileName = this._truncateName(status.fileName);
            return this.options.createProgressBar(status);
        })
            .join("\n");
        this._logUpdate(newLog);
    }

    protected _truncateName(text: string) {
        if (this.options.truncateName && text) {
            const length = typeof this.options.truncateName === "number" ? this.options.truncateName : TRUNCATE_TEXT_MAX_LENGTH;
            return truncateText(text, length);
        }
        return text;
    }

    protected _logUpdate(text: string) {
        logUpdate(text);
    }
}
