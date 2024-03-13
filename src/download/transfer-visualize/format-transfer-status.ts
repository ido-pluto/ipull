import {TransferProgressInfo} from "./transfer-statistics.js";
import prettyBytes, {Options as PrettyBytesOptions} from "pretty-bytes";
import prettyMilliseconds, {Options as PrettyMsOptions} from "pretty-ms";
import {ProgressStatus} from "../download-engine/download-file/progress-status-file.js";

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

export const PRETTY_MS_OPTIONS: PrettyMsOptions = {
    ...NUMBER_FORMAT_OPTIONS,
    keepDecimalsOnWholeSeconds: true,
    secondsDecimalDigits: 2,
    compact: true
};

const PRETTY_BYTES_OPTIONS: PrettyBytesOptions = {...NUMBER_FORMAT_OPTIONS, space: false};

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
    const formatTotal = prettyBytes(fullStatus.totalBytes, PRETTY_BYTES_OPTIONS);
    const formatTransferredOfTotal = `${formatTransferred}/${formatTotal}`;
    const formatTimeLeft = prettyMilliseconds(fullStatus.timeLeft, PRETTY_MS_OPTIONS);
    const formattedPercentage = fullStatus.percentage.toLocaleString(undefined, {
        minimumIntegerDigits: 1,
        minimumFractionDigits: 4
    })
        .slice(0, 5) + "%";

    return {
        ...fullStatus,
        formattedSpeed,
        formatTransferred,
        formatTransferredOfTotal,
        formatTotal,
        formatTimeLeft,
        formattedPercentage,
        formattedComment: fullStatus.comment ? `(${fullStatus.comment})` : ""
    };
}
