import { DownloadStatus, ProgressStatus } from "../download-engine/download-file/progress-status-file.js";
import { TransferProgressInfo } from "./transfer-statistics.js";
import prettyBytes, { PrettyBytesOptions, formatTrunc } from "./utils/prettyBytesFast.js";
import prettyMillisecondsCompact from "./utils/prettyMSFast.js";

const DEFAULT_LOCALIZATION: Intl.LocalesArgument = "en-US";

export type CliInfoStatus = TransferProgressInfo & {
    fileName?: string,
    comment?: string
};

export type FormattedStatus = ProgressStatus & CliInfoStatus & {
    formattedSpeed: string,
    formatTransferred: string,
    formatTotal: string
    formatTransferredOfTotal: string,
    formatTimeLeft: string,
    formattedPercentage: string,
    formattedComment: string
};

const NUMBER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    minimumIntegerDigits: 3
};

const PERCENTAGE_FRACTION_DIGITS = 4;

const PRETTY_BYTES_OPTIONS: PrettyBytesOptions = {...NUMBER_FORMAT_OPTIONS, space: false };

const DEFAULT_CLI_INFO_STATUS: CliInfoStatus = {
    speed: 0,
    transferredBytes: 0,
    totalBytes: 0,
    percentage: 0,
    timeLeft: 0,
    ended: false
};

function formatSpeed(speed: number): string {
    return prettyBytes(Math.min(speed, 9999999999) || 0, PRETTY_BYTES_OPTIONS) + "/s";
}

export function createFormattedStatus(status: ProgressStatus | FormattedStatus): FormattedStatus {
    if ("formattedSpeed" in status) {
        return status;
    }

    const fullStatus = {...DEFAULT_CLI_INFO_STATUS, ...status};
    const formattedSpeed = formatSpeed(fullStatus.speed);
    const formatTransferred = prettyBytes(fullStatus.transferredBytes, PRETTY_BYTES_OPTIONS);
    const formatTotal = fullStatus.totalBytes === 0 ? "???" : prettyBytes(fullStatus.totalBytes, PRETTY_BYTES_OPTIONS);
    const formatTransferredOfTotal = `${formatTransferred}/${formatTotal}`;
    const formatTimeLeft = fullStatus.totalBytes === 0 ? "unknown time" : prettyMillisecondsCompact(fullStatus.timeLeft);
    const formattedPercentage = formatTrunc(fullStatus.percentage, PERCENTAGE_FRACTION_DIGITS, PERCENTAGE_FRACTION_DIGITS).slice(0, 5) + "%";

    let fullComment = fullStatus.comment;
    if (status.downloadStatus === DownloadStatus.Cancelled || status.downloadStatus === DownloadStatus.Paused) {
        if (fullComment) {
            fullComment += " | " + status.downloadStatus;
        } else {
            fullComment = status.downloadStatus;
        }
    }

    return {
        ...fullStatus,
        formattedSpeed,
        formatTransferred,
        formatTransferredOfTotal,
        formatTotal,
        formatTimeLeft,
        formattedPercentage,
        formattedComment: fullComment ? `(${fullComment})` : ""
    };
}
