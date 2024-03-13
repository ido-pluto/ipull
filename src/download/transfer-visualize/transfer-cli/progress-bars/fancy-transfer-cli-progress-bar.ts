import chalk from "chalk";
import {truncateText} from "../../utils/cli-text.js";
import {FormattedStatus, PRETTY_MS_OPTIONS} from "../../format-transfer-status.js";
import isUnicodeSupported from "is-unicode-supported";
import {DataPart, renderDataLine} from "../../utils/data-line.js";
import prettyMilliseconds from "pretty-ms";
import sliceAnsi from "slice-ansi";
import stripAnsi from "strip-ansi";

export type FancyCliOptions = {
    truncateName?: boolean | number
};

const minNameLength = 20;
const minCommentLength = 15;

const statusIcons = isUnicodeSupported()
    ? {
        activeDownload: chalk.blue("⏵"),
        done: chalk.green("✔"),
        failed: chalk.red("✖"),
        pending: chalk.yellow("\u25f7")
    }
    : {
        activeDownload: chalk.blue.bold(">"),
        done: chalk.green("√"),
        failed: chalk.red("×"),
        pending: chalk.yellow.bold("-")
    };

/**
 * A class to display transfer progress in the terminal, with a progress bar and other information.
 */
export default class FancyTransferCliProgressBar {
    protected status: FormattedStatus;
    protected options: FancyCliOptions;

    protected constructor(status: FormattedStatus, options: FancyCliOptions = {}) {
        this.status = status;
        this.options = options;
    }

    protected renderProgressLine(): string {
        const {formattedSpeed, formatTimeLeft, formatTransferred, formatTotal, formattedPercentage, percentage} = this.status;

        const formattedPercentageWithPadding = formattedPercentage.padEnd(6, " ");
        const progressBarText = ` ${formattedPercentageWithPadding} (${formatTransferred}/${formatTotal}) `;
        const etaText = formatTimeLeft + " left";

        return renderDataLine([{
            type: "status",
            fullText: "",
            size: 1,
            formatter: () => statusIcons.activeDownload
        }, {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, ...this.getNameAndCommentDataParts(), {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, {
            type: "progressBar",
            fullText: progressBarText,
            size: Math.max(progressBarText.length, `100.0% (1024.00MB/${formatTotal})`.length),
            flex: 4,
            addEndPadding: 4,
            maxSize: 40,
            formatter(_, size) {
                const leftPad = " ".repeat(Math.floor((size - progressBarText.length) / 2));
                return renderProgressBar({
                    barText: leftPad + ` ${chalk.black.bgWhiteBright(formattedPercentageWithPadding)} ${chalk.gray(`(${formatTransferred}/${formatTotal})`)} `,
                    backgroundText: leftPad + ` ${chalk.yellow.bgGray(formattedPercentageWithPadding)} ${chalk.white(`(${formatTransferred}/${formatTotal})`)} `,
                    length: size,
                    loadedPercentage: percentage / 100,
                    barStyle: chalk.black.bgWhiteBright,
                    backgroundStyle: chalk.bgGray
                });
            }
        }, {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, {
            type: "speed",
            fullText: formattedSpeed,
            size: formattedSpeed.length
        }, {
            type: "spacer",
            fullText: " | ",
            size: " | ".length,
            formatter: (text) => chalk.dim(text)
        }, {
            type: "timeLeft",
            fullText: etaText,
            size: etaText.length,
            formatter: (text) => chalk.dim(text)
        }]);
    }

    protected getNameAndCommentDataParts(): DataPart[] {
        const {fileName, comment} = this.status;

        return [{
            type: "name",
            fullText: fileName,
            size: this.options.truncateName === false
                ? fileName.length
                : typeof this.options.truncateName === "number"
                    ? this.options.truncateName
                    : Math.min(fileName.length, minNameLength),
            flex: typeof this.options.truncateName === "number"
                ? undefined
                : 1,
            maxSize: fileName.length,
            cropper: truncateText,
            formatter: (text) => chalk.bold(text)
        }, ...(
            (comment == null || comment.length === 0)
                ? []
                : [{
                    type: "spacer",
                    fullText: " (",
                    size: " (".length,
                    formatter: (text) => chalk.dim(text)
                }, {
                    type: "nameComment",
                    fullText: comment,
                    size: Math.min(comment.length, minCommentLength),
                    maxSize: comment.length,
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

    protected renderFinishedLine() {
        const wasSuccessful = this.status.percentage === 100;
        const {endTime, startTime} = this.status;

        const downloadTime = (endTime || Date.now()) - startTime;
        const finishedText = wasSuccessful
            ? `downloaded ${this.status.formatTransferred} in ${prettyMilliseconds(downloadTime, PRETTY_MS_OPTIONS)}`
            : `failed downloading after ${prettyMilliseconds(endTime - startTime, PRETTY_MS_OPTIONS)}`;

        return renderDataLine([{
            type: "status",
            fullText: "",
            size: 1,
            formatter: () => (
                wasSuccessful
                    ? statusIcons.done
                    : statusIcons.failed
            )
        }, {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, ...this.getNameAndCommentDataParts(), {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, {
            type: "description",
            fullText: finishedText,
            size: finishedText.length,
            formatter: (text) => chalk.dim(text)
        }]);
    }

    protected renderPendingLine() {
        const pendingText = `will download ${this.status.formatTotal}`;

        return renderDataLine([{
            type: "status",
            fullText: "",
            size: 1,
            formatter: () => statusIcons.pending
        }, {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, ...this.getNameAndCommentDataParts(), {
            type: "spacer",
            fullText: " ",
            size: " ".length,
            formatter: (text) => text
        }, {
            type: "description",
            fullText: pendingText,
            size: pendingText.length,
            formatter: (text) => chalk.dim(text)
        }]);
    }

    public renderStatusLine(): string {
        if (this.status.ended) {
            return this.renderFinishedLine();
        }

        if (this.status.transferredBytes === 0) {
            return this.renderPendingLine();
        }

        return this.renderProgressLine();
    }

    public static createLineRenderer(options: FancyCliOptions) {
        return (status: FormattedStatus) => {
            return new FancyTransferCliProgressBar(status, options).renderStatusLine();
        };
    }
}

function renderProgressBar({barText, backgroundText, length, loadedPercentage, barStyle, backgroundStyle}: {
    barText: string,
    backgroundText: string,
    length: number,
    loadedPercentage: number,
    barStyle(text: string): string,
    backgroundStyle(text: string): string
}) {
    const barChars = Math.floor(length * loadedPercentage);
    const backgroundChars = length - barChars;

    const slicedBarText = sliceAnsi(barText, 0, barChars);
    const paddedBarText = slicedBarText + " ".repeat(barChars - stripAnsi(slicedBarText).length);
    const slicedBackgroundText = sliceAnsi(backgroundText, barChars, barChars + backgroundChars);
    const paddedBackgroundText = slicedBackgroundText + " ".repeat(backgroundChars - stripAnsi(slicedBackgroundText).length);

    return barStyle(paddedBarText) + backgroundStyle(paddedBackgroundText);
}
