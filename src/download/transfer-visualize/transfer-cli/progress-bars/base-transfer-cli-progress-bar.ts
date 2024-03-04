import chalk from "chalk";
import {centerPad} from "../../utils/cli-text.js";
import {clamp} from "../../utils/numbers.js";
import {FormattedStatus} from "../../format-transfer-status.js";

export type CliFormattedStatus = FormattedStatus & {
    transferAction: string
};

/**
 * A class to display transfer progress in the terminal, with a progress bar and other information.
 */
export default class BaseTransferCliProgressBar {
    protected status: CliFormattedStatus;

    protected constructor(status: CliFormattedStatus) {
        this.status = status;
    }

    protected createProgressBarLine(length: number) {
        const percentage = clamp(this.status.transferredBytes / this.status.totalBytes, 0, 1);
        const fullLength = Math.floor(percentage * length);
        const emptyLength = length - fullLength;

        return `${"=".repeat(fullLength)}>${" ".repeat(emptyLength)}`;
    }

    protected createProgressBarFormat(): string {
        const {fileName, formattedComment, formattedSpeed, formatTransferredOfTotal, formatTimeLeft, formattedPercentage} = this.status;

        return `${chalk.cyan(this.status.transferAction)} ${fileName} ${chalk.dim(formattedComment)}
${chalk.green(formattedPercentage.padEnd(7))
            .padStart(6)}  [${chalk.cyan(this.createProgressBarLine(50))}]  ${centerPad(formatTransferredOfTotal, 18)}  ${centerPad(formattedSpeed, 10)}  ${centerPad(formatTimeLeft, 5)} left`;
    }

    protected transferEnded() {
        const status = this.status.percentage === 100 ? chalk.green("✓") : chalk.red("✗");
        return `${status} ${this.status.fileName} ${this.status.formatTransferred} ${chalk.dim(this.status.formattedComment)}`;
    }

    protected transferNotStarted() {
        return `⌛ ${this.status.fileName} ${this.status.formatTotal} ${chalk.dim(this.status.formattedComment)}`;
    }

    public createStatusLine(): string {
        if (this.status.ended) {
            return this.transferEnded();
        }

        if (this.status.transferredBytes === 0) {
            return this.transferNotStarted();
        }

        return this.createProgressBarFormat();
    }

    public static create(status: CliFormattedStatus) {
        return new BaseTransferCliProgressBar(status).createStatusLine();
    }
}
