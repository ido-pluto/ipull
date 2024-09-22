import chalk from "chalk";
import {SummaryMultiProgressBar} from "../multiProgressBars/SummaryMultiProgressBar.js";
import {DataLine, renderDataLine} from "../../utils/data-line.js";
import FancyTransferCliProgressBar from "./fancy-transfer-cli-progress-bar.js";
import {STATUS_ICONS} from "../../utils/progressBarIcons.js";
import {DownloadFlags} from "../../../download-engine/download-file/progress-status-file.js";


export default class SummaryTransferCliProgressBar extends FancyTransferCliProgressBar {
    override multiProgressBar = SummaryMultiProgressBar;

    switchTransferToIcon() {
        switch (this.status.transferAction) {
            case "Downloading":
                return "↓";
            case "Copying":
                return "→";
        }

        return this.status.transferAction;
    }

    override renderProgressLine(): string {
        if (this.status.downloadFlags.includes(DownloadFlags.DownloadSequence)) {
            return this.renderDownloadSequence();
        }

        const pendingText = `downloading ${this.status.formatTotal}`;
        return renderDataLine([{
            type: "status",
            fullText: "",
            size: 1,
            formatter: () => STATUS_ICONS.activeDownload
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

    protected renderDownloadSequence(): string {
        const {formatTransferredOfTotal, formattedSpeed, formatTimeLeft, comment, formattedPercentage} = this.status;
        const progressBar = `(${formatTransferredOfTotal})`;
        const dataLine: DataLine = [
            {
                type: "status",
                fullText: "",
                size: 1,
                formatter: () => chalk.cyan(this.switchTransferToIcon())
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length,
                formatter: (text) => text
            },
            {
                type: "percentage",
                fullText: formattedPercentage,
                size: 6,
                formatter: (text) => text
            },
            {
                type: "spacer",
                fullText: " ",
                size: " ".length,
                formatter: (text) => text
            },
            {
                type: "progressBar",
                fullText: progressBar,
                size: progressBar.length,
                formatter: (text) => text
            },
            {
                type: "spacer",
                fullText: " | ",
                size: " | ".length,
                formatter: (text) => chalk.dim(text)
            },
            {
                type: "nameComment",
                fullText: comment || "",
                size: (comment || "").length,
                formatter: (text) => text
            },
            {
                type: "spacer",
                fullText: " | ",
                size: " | ".length,
                formatter: (text) => chalk.dim(text)
            },
            {
                type: "speed",
                fullText: formattedSpeed,
                size: formattedSpeed.length
            }
        ];

        if (this.showETA) {
            dataLine.push(
                {
                    type: "spacer",
                    fullText: " | ",
                    size: " | ".length,
                    formatter: (text) => chalk.dim(text)
                },
                {
                    type: "timeLeft",
                    fullText: formatTimeLeft,
                    size: formatTimeLeft.length,
                    formatter: (text) => text
                }
            );
        }

        return renderDataLine(dataLine);
    }
}
