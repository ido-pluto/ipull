import chalk from "chalk";
import {truncateText} from "../../utils/cli-text.js";
import {clamp} from "../../utils/numbers.js";
import {FormattedStatus} from "../../format-transfer-status.js";
import {DownloadStatus} from "../../../download-engine/download-file/progress-status-file.js";
import {BaseMultiProgressBar} from "../multiProgressBars/BaseMultiProgressBar.js";
import {STATUS_ICONS} from "../../utils/progressBarIcons.js";
import {DataLine, DataPart, renderDataLine} from "../../utils/data-line.js";

const SKIP_ETA_START_TIME = 1000 * 2;
const MIN_NAME_LENGTH = 20;
const MIN_COMMENT_LENGTH = 15;

export type CliFormattedStatus = FormattedStatus & {
    transferAction: string
};

export type BaseCliOptions = {
    truncateName?: boolean | number
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
    protected status: CliFormattedStatus = null!;
    protected options: BaseCliOptions;
    protected minNameLength = MIN_NAME_LENGTH;


    public constructor(options: BaseCliOptions) {
        this.options = options;
    }

    protected get showETA(): boolean {
        return this.status.startTime < Date.now() - SKIP_ETA_START_TIME;
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
            size: this.options.truncateName === false
                ? fileName.length
                : typeof this.options.truncateName === "number"
                    ? this.options.truncateName
                    : Math.min(fileName.length, this.minNameLength),
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


    protected getETA(spacer = " | "): DataLine {
        const formatedTimeLeft = this.status.timeLeft < 1_000 ? "0s" : this.status.formatTimeLeft;
        const timeLeft = `${formatedTimeLeft.padStart("10s".length)} left`;
        if (this.showETA) {
            return [{
                type: "spacer",
                fullText: spacer,
                size: spacer.length
            }, {
                type: "timeLeft",
                fullText: timeLeft,
                size: timeLeft.length
            }];
        }

        return [];
    }

    protected createProgressBarLine(length: number) {
        const percentage = clamp(this.status.transferredBytes / this.status.totalBytes, 0, 1);
        const fullLength = Math.floor(percentage * length);
        const emptyLength = length - fullLength;

        return `${"=".repeat(fullLength)}>${" ".repeat(emptyLength)}`;
    }

    protected renderProgressLine(): string {
        const {formattedPercentage, formattedSpeed, formatTransferredOfTotal, formatTotal} = this.status;

        return renderDataLine([
            {
                type: "status",
                fullText: this.status.transferAction,
                size: this.status.transferAction.length,
                formatter: (text) => chalk.cyan(text)
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length
            },
            ...this.getNameAndCommentDataParts(),
            {
                type: "spacer",
                fullText: "\n",
                size: 1
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
                size: "[=====>]".length,
                fullText: this.createProgressBarLine(10),
                flex: 4,
                addEndPadding: 4,
                maxSize: 40,
                formatter: (_, size) => {
                    return `[${chalk.cyan(this.createProgressBarLine(size))}]`;
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
                size: `1024.00MB/${formatTotal}`.length
            },
            {
                type: "spacer",
                fullText: " | ",
                size: " | ".length
            },
            {
                type: "speed",
                fullText: formattedSpeed,
                size: Math.max("00.00kB/s".length, formattedSpeed.length)
            },
            ...this.getETA()
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

    public createStatusLine(status: CliFormattedStatus): string {
        this.status = status;

        if ([DownloadStatus.Finished, DownloadStatus.Error, DownloadStatus.Cancelled].includes(this.status.downloadStatus)) {
            return this.renderFinishedLine();
        }

        if (this.status.downloadStatus === DownloadStatus.NotStarted) {
            return this.renderPendingLine();
        }

        return this.renderProgressLine();
    }
}
