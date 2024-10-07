import chalk from "chalk";
import {truncateText} from "../../utils/cli-text.js";
import {clamp} from "../../utils/numbers.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";
import {BaseMultiProgressBar} from "../multiProgressBars/BaseMultiProgressBar.js";
import {STATUS_ICONS} from "../../utils/progressBarIcons.js";
import {DataLine, DataPart, renderDataLine} from "../../utils/data-line.js";
import cliSpinners, {Spinner} from "cli-spinners";

const SKIP_ETA_START_TIME = 1000 * 2;
const MIN_NAME_LENGTH = 20;
const MIN_COMMENT_LENGTH = 15;
const DEFAULT_SPINNER_UPDATE_INTERVAL_MS = 10;

export type CliFormattedStatus = FormattedStatus & {
    transferAction: string
};

export type BaseCliOptions = {
    truncateName?: boolean | number
    loadingSpinner?: cliSpinners.SpinnerName
};

export interface TransferCliProgressBar {
    multiProgressBar: typeof BaseMultiProgressBar;

    createStatusLine(status: CliFormattedStatus): string;
}

/**
 * A class to display transfer progress in the terminal, with a progress bar and other information.
 */
export default class BaseTransferCliProgressBar implements TransferCliProgressBar {
    public multiProgressBar = BaseMultiProgressBar;
    public downloadLoadingSpinner: Spinner;
    private _spinnerState = {
        step: 0,
        lastChanged: 0
    };

    protected status: CliFormattedStatus = null!;
    protected options: BaseCliOptions;
    protected minNameLength = MIN_NAME_LENGTH;


    public constructor(options: BaseCliOptions) {
        this.options = options;
        this.downloadLoadingSpinner = cliSpinners[options.loadingSpinner ?? "dots"];
    }

    switchTransferToShortText() {
        switch (this.status.transferAction) {
            case "Downloading":
                return "Pull";
            case "Copying":
                return "Copy";
        }

        return this.status.transferAction;
    }

    protected get showETA(): boolean {
        return this.status.startTime < Date.now() - SKIP_ETA_START_TIME;
    }

    protected getNameSize(fileName = this.status.fileName) {
        return this.options.truncateName === false
            ? fileName.length
            : typeof this.options.truncateName === "number"
                ? this.options.truncateName
                : Math.min(fileName.length, this.minNameLength);
    }

    protected getSpinnerText() {
        const spinner = this.downloadLoadingSpinner.frames[this._spinnerState.step];

        if (this._spinnerState.lastChanged + DEFAULT_SPINNER_UPDATE_INTERVAL_MS < Date.now()) {
            this._spinnerState.step++;
            if (this._spinnerState.step >= this.downloadLoadingSpinner.frames.length) {
                this._spinnerState.step = 0;
            }
            this._spinnerState.lastChanged = Date.now();
        }

        return spinner;
    }

    protected getNameAndCommentDataParts(): DataPart[] {
        const {fileName, comment, downloadStatus} = this.status;

        let fullComment = comment;
        if (downloadStatus === DownloadStatus.Cancelled || downloadStatus === DownloadStatus.Paused) {
            if (fullComment) {
                fullComment += " | " + downloadStatus;
            } else {
                fullComment = downloadStatus;
            }
        }

        return [{
            type: "name",
            fullText: fileName,
            size: this.getNameSize(),
            flex: typeof this.options.truncateName === "number"
                ? undefined
                : 1,
            maxSize: fileName.length,
            cropper: truncateText,
            formatter: (text) => chalk.bold(text)
        }, ...(
            (fullComment == null || fullComment.length === 0)
                ? []
                : [{
                    type: "spacer",
                    fullText: " (",
                    size: " (".length,
                    formatter: (text) => chalk.dim(text)
                }, {
                    type: "nameComment",
                    fullText: fullComment,
                    size: Math.min(fullComment.length, MIN_COMMENT_LENGTH),
                    maxSize: fullComment.length,
                    flex: 1,
                    cropper: truncateText,
                    formatter: (text) => chalk.dim(text)
                }, {
                    type: "spacer",
                    fullText: ")",
                    size: ")".length,
                    formatter: (text) => chalk.dim(text)
                }] satisfies DataPart[]
        )];
    }

    protected getETA(spacer = " | ", formatter: (text: string, size: number, type: "spacer" | "time") => string = text => text): DataLine {
        const formatedTimeLeft = this.status.timeLeft < 1_000 ? "0s" : this.status.formatTimeLeft;
        const timeLeft = `${formatedTimeLeft.padStart("10s".length)} left`;
        if (this.showETA) {
            return [{
                type: "spacer",
                fullText: spacer,
                size: spacer.length,
                formatter(text: string, size: number): string {
                    return formatter(text, size, "spacer");
                }
            }, {
                type: "timeLeft",
                fullText: timeLeft,
                size: timeLeft.length,
                formatter(text: string, size: number): string {
                    return formatter(text, size, "time");
                }
            }];
        }

        return [];
    }

    protected createProgressBarLine(length: number) {
        const fileName = truncateText(this.status.fileName, length);
        const percentage = clamp(this.status.transferredBytes / this.status.totalBytes, 0, 1);
        const fullLength = Math.floor(percentage * length);
        const emptyLength = length - fullLength;

        return chalk.cyan(fileName.slice(0, fullLength)) + chalk.dim(fileName.slice(fullLength, fullLength + emptyLength));
    }

    protected renderProgressLine(): string {
        const {formattedPercentage, formattedSpeed, formatTransferredOfTotal, formatTotal} = this.status;

        const status = this.switchTransferToShortText();
        return renderDataLine([
            {
                type: "status",
                fullText: status,
                size: status.length,
                formatter: (text) => chalk.cyan(text)
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            {
                type: "percentage",
                fullText: formattedPercentage,
                size: "100.00%".length,
                formatter: () => chalk.green(formattedPercentage)
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            {
                type: "progressBar",
                size: this.getNameSize(),
                fullText: "",
                flex: 4,
                addEndPadding: 4,
                maxSize: 40,
                formatter: (_, size) => {
                    return `[${this.createProgressBarLine(size)}]`;
                }
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            {
                type: "transferred",
                fullText: formatTransferredOfTotal,
                size: `999.99MB/${formatTotal}`.length
            },
            {
                type: "spacer",
                fullText: " (",
                size: " (".length
            },
            {
                type: "speed",
                fullText: formattedSpeed,
                size: Math.max("00.00kB/s".length, formattedSpeed.length),
                formatter: text => chalk.ansi256(31)(text)
            },
            {
                type: "spacer",
                fullText: ")",
                size: ")".length
            },
            ...this.getETA(" ~ ", text => chalk.dim(text))
        ]);
    }

    protected renderFinishedLine() {
        const status = this.status.downloadStatus === DownloadStatus.Finished ? chalk.green(STATUS_ICONS.done) : chalk.red(STATUS_ICONS.failed);

        return renderDataLine([
            {
                type: "status",
                fullText: "",
                size: 1,
                formatter: () => status
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            ...this.getNameAndCommentDataParts()
        ]);
    }

    protected renderPendingLine() {
        return renderDataLine([
            {
                type: "status",
                fullText: "",
                size: 1,
                formatter: () => STATUS_ICONS.pending
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            ...this.getNameAndCommentDataParts(),
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            {
                type: "description",
                fullText: this.status.formatTotal,
                size: this.status.formatTotal.length,
                formatter: (text) => chalk.dim(text)
            }
        ]);
    }

    protected renderLoadingLine() {
        const spinner = this.getSpinnerText();
        const showText = "Gathering information";

        return renderDataLine([
            {
                type: "status",
                fullText: spinner,
                size: spinner.length,
                formatter: (text) => chalk.cyan(text)
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            {
                type: "name",
                fullText: showText,
                size: this.getNameSize(showText),
                flex: typeof this.options.truncateName === "number"
                    ? undefined
                    : 1,
                maxSize: showText.length,
                cropper: truncateText,
                formatter: (text) => chalk.bold(text)
            }
        ]);
    }

    public createStatusLine(status: CliFormattedStatus): string {
        this.status = status;

        if ([DownloadStatus.Finished, DownloadStatus.Error, DownloadStatus.Cancelled].includes(this.status.downloadStatus)) {
            return this.renderFinishedLine();
        }

        if (this.status.downloadStatus === DownloadStatus.NotStarted) {
            return this.renderPendingLine();
        }

        if (this.status.downloadStatus === DownloadStatus.Loading) {
            return this.renderLoadingLine();
        }

        return this.renderProgressLine();
    }
}
