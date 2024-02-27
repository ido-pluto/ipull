import logUpdate from "log-update";
import chalk from "chalk";
import debounce from "lodash.debounce";
import {TRUNCATE_TEXT_MAX_LENGTH, truncateText} from "../../../utils/truncate-text.js";
import {clamp} from "../../../utils/numbers.js";
import {TransferProgressInfo} from "../transfer-statistics.js";
import prettyBytes, {Options as PrettyBytesOptions} from "pretty-bytes";
import prettyMilliseconds, {Options as PrettyMsOptions} from "pretty-ms";

export type TransferCliStatus = TransferProgressInfo & {
    fileName?: string,
    comment?: string
};

export type FormattedCliStatus = {
    formattedSpeed: string,
    transferredBytes: string,
    formatTimeLeft: string,
    formattedPercentage: string,
    fileName?: string,
    comment?: string
};


export type TransferCliOptions = {
    action?: string,
    name?: string,
    truncateName?: boolean | number;
    debounceWait?: number;
    maxDebounceWait?: number;
};

export type CustomOutput = (info: TransferCliStatus & FormattedCliStatus) => string;

export const DEFAULT_TRANSFER_CLI_OPTIONS: TransferCliOptions = {
    action: "Transferring",
    truncateName: true,
    name: "",
    debounceWait: 20,
    maxDebounceWait: 100
};

/**
 * A class to display transfer progress in the terminal, with a progress bar and other information.
 */
export default class TransferCli {
    protected static readonly _NUMBER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        minimumIntegerDigits: 3
    };
    protected static readonly _PRETTY_MS_OPTIONS: PrettyMsOptions = {
        ...TransferCli._NUMBER_FORMAT_OPTIONS,
        keepDecimalsOnWholeSeconds: true,
        secondsDecimalDigits: 2,
        compact: true
    };
    protected static readonly _PRETTY_BYTES_OPTIONS: PrettyBytesOptions = {...TransferCli._NUMBER_FORMAT_OPTIONS, space: false};
    static readonly PROGRESS_BAR_LENGTH = 30;

    protected _options: TransferCliOptions;
    protected _currentStatus: TransferCliStatus = {
        total: 0,
        transferred: 0,
        percentage: 0,
        timeLeft: 0,
        speed: 0,
        ended: false
    };

    get currentStatus() {
        return this._currentStatus;
    }

    get currentFormattedStatus(): FormattedCliStatus {
        const formattedSpeed = TransferCli._formatSpeed(this._currentStatus.speed);
        const transferredBytes = `${prettyBytes(this._currentStatus.transferred, TransferCli._PRETTY_BYTES_OPTIONS)}/${prettyBytes(this._currentStatus.total, TransferCli._PRETTY_BYTES_OPTIONS)}`;
        const formatTimeLeft = prettyMilliseconds(this._currentStatus.timeLeft, TransferCli._PRETTY_MS_OPTIONS);
        const formattedPercentage = this._currentStatus.percentage.toLocaleString(undefined, {
            ...TransferCli._NUMBER_FORMAT_OPTIONS,
            minimumIntegerDigits: 1
        }) + "%";

        return {
            formattedSpeed,
            transferredBytes,
            formatTimeLeft,
            formattedPercentage,
            fileName: this._options.name || this._currentStatus.fileName,
            comment: this._currentStatus.comment ? `(${this._currentStatus.comment})` : ""
        };
    }

    public constructor(options: TransferCliOptions = {}) {
        this._options = {...DEFAULT_TRANSFER_CLI_OPTIONS, ...options};
        this._options.name = this._truncateName(this._options.name);
        this._logUpdate = debounce(this._logUpdate.bind(this), this._options.debounceWait, {
            maxWait: this._options.maxDebounceWait
        });
        this.updateProgress = this.updateProgress.bind(this);
    }

    public updateProgress(status = this._currentStatus) {
        this._currentStatus = {
            ...this._currentStatus,
            ...status
        };
        this._currentStatus.fileName = this._truncateName(this._currentStatus.fileName);
        this._logUpdate(this.createProgressBarFormat());
    }

    protected _truncateName(text?: string) {
        if (this._options.truncateName && text) {
            const length = typeof this._options.truncateName === "number" ? this._options.truncateName : TRUNCATE_TEXT_MAX_LENGTH;
            return truncateText(text, length);
        }
        return text;
    }

    protected createProgressBarLine() {
        const percentage = clamp(this._currentStatus.transferred / this._currentStatus.total, 0, 1);
        const fullLength = Math.floor(percentage * TransferCli.PROGRESS_BAR_LENGTH);
        const emptyLength = TransferCli.PROGRESS_BAR_LENGTH - fullLength;

        return `${"=".repeat(fullLength)}>${" ".repeat(emptyLength)}`;
    }

    protected createProgressBarFormat(): string {
        const {fileName, comment, formattedSpeed, transferredBytes, formatTimeLeft, formattedPercentage} = this.currentFormattedStatus;

        return `${chalk.cyan(this._options.action)} ${fileName} ${chalk.dim(comment)}
${chalk.green(formattedPercentage.padEnd(7))
            .padStart(6)}  [${chalk.cyan(this.createProgressBarLine())}]  ${TransferCli.centerPad(transferredBytes, 18)}  ${TransferCli.centerPad(formattedSpeed, 10)}  ${TransferCli.centerPad(formatTimeLeft, 5)} left`;
    }

    protected _logUpdate(text: string) {
        logUpdate(text);
    }

    static centerPad(text: string, length: number) {
        const padLength = Math.max(0, length - text.length);
        const leftPad = Math.floor(padLength / 2);
        const rightPad = Math.ceil(padLength / 2);
        return " ".repeat(leftPad) + text + " ".repeat(rightPad);
    }

    private static _formatSpeed(speed: number): string {
        return prettyBytes(Math.min(speed, 9999999999) || 0, TransferCli._PRETTY_BYTES_OPTIONS) + "/s";
    }

    /**
     * Create a custom format for the progress bar.
     */
    static customFormat(callback: CustomOutput, options?: TransferCliOptions) {
        const transferCli = new TransferCli(options);
        transferCli.createProgressBarFormat = () => {
            return callback({
                ...transferCli.currentStatus,
                ...transferCli.currentFormattedStatus
            });
        };

        return transferCli;
    }
}
