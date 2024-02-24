import logUpdate from "log-update";
import chalk from "chalk";
import debounce from "lodash.debounce";
import {TRUNCATE_TEXT_MAX_LENGTH, truncateText} from "../../utils/truncate-text.js";
import {clamp} from "../../utils/numbers.js";
import {TransferProgressInfo} from "./transfer-statistics.js";

export type TransferCliStatus = TransferProgressInfo & {
    fileName?: string,
    objectType?: string
};

export type TransferCliOptions = {
    action?: string,
    name?: string,
    truncateName?: boolean | number;
    debounceWait?: number;
    maxDebounceWait?: number;
};

export const DEFAULT_TRANSFER_CLI_OPTIONS: TransferCliOptions = {
    action: "Downloading",
    truncateName: true,
    name: "",
    debounceWait: 10,
    maxDebounceWait: 100
};

export default class TransferCli {
    static readonly PROGRESS_BAR_LENGTH = 50;

    protected _options: TransferCliOptions;
    protected _currentStatus: TransferCliStatus = {
        total: 0,
        transferred: 0,
        percentage: 0,
        timeLeft: "0",
        speed: "0",
        transferredBytes: "0 bytes/0 bytes",
        ended: false
    };

    constructor(options: TransferCliOptions = {}) {
        this._options = {...DEFAULT_TRANSFER_CLI_OPTIONS, ...options};
        this._options.name = this._truncateName(this._options.name);
        this._logUpdate = debounce(this._logUpdate.bind(this), this._options.debounceWait, {
            maxWait: this._options.maxDebounceWait
        });
    }

    updateProgress(status = this._currentStatus) {
        this._currentStatus = {
            ...this._currentStatus,
            ...status
        };
        this._currentStatus.fileName = this._truncateName(this._currentStatus.fileName);
        this._logUpdate(this._createProgressBarFormat());
    }

    protected _truncateName(text?: string) {
        if (this._options.truncateName && text) {
            const length = typeof this._options.truncateName === "number" ? this._options.truncateName : TRUNCATE_TEXT_MAX_LENGTH;
            return truncateText(text, length);
        }
        return text;
    }

    protected _createProgressBarLine() {
        const percentage = clamp(this._currentStatus.transferred / this._currentStatus.total, 0, 1);
        const fullLength = Math.floor(percentage * TransferCli.PROGRESS_BAR_LENGTH);
        const emptyLength = TransferCli.PROGRESS_BAR_LENGTH - fullLength;

        return `${"█".repeat(fullLength)}${"░".repeat(emptyLength)}`;
    }

    protected _createProgressBarFormat(): string {
        return `${this._options.action} ${this._options.name || this._currentStatus.fileName} ${this._currentStatus.objectType ? `(${this._currentStatus.objectType}) ` : ""}| ${chalk.cyan(this._createProgressBarLine())} | ${this._currentStatus.percentage}%
${this._currentStatus.transferredBytes} | Speed: ${this._currentStatus.speed} | Time: ${this._currentStatus.timeLeft}`;
    }

    protected _logUpdate(text: string) {
        logUpdate(text);
    }

}
