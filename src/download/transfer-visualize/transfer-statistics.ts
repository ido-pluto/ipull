import prettyBytes, {Options as PrettyBytesOptions} from "pretty-bytes";
import prettyMs, {Options as PrettyMsOptions} from "pretty-ms";
import {clamp} from "../../utils/numbers.js";

export type TransferProgressInfo = {
    transferred: number,
    total: number,
    speed: string,
    percentage: number,
    timeLeft: string,
    transferredBytes: string,
    ended: boolean
};

const MAX_TIME_LEFT = 35 * 24 * 60 * 60 * 1000; // 35 days

export default class TransferStatistics {
    protected static readonly _PRETTY_MS_OPTIONS: PrettyMsOptions = {millisecondsDecimalDigits: 1, keepDecimalsOnWholeSeconds: true};
    protected static readonly _PRETTY_BYTES_OPTIONS: PrettyBytesOptions = {maximumFractionDigits: 2, minimumFractionDigits: 2};
    protected static readonly _AVERAGE_SPEED_LAST_SECONDS = 10;

    private _speeds: { [dateInSeconds: number]: number } = [];
    private _lastTransferred = 0;
    private _latestProgress?: TransferProgressInfo;

    get latestProgress() {
        return this._latestProgress;
    }

    private static _formatSpeed(speed: number): string {
        return prettyBytes(Math.min(speed, 9999999999) || 0, TransferStatistics._PRETTY_BYTES_OPTIONS) + "/s";
    }

    private _calculateSpeed(currentTransferred: number): number {
        const dateInSeconds = Math.floor(Date.now() / 1000);
        this._speeds[dateInSeconds] ??= 0;
        this._speeds[dateInSeconds] += currentTransferred - (this._lastTransferred || currentTransferred);
        this._lastTransferred = currentTransferred;

        let averageSecondsAverageSpeed = 0;
        for (let i = 0; i < TransferStatistics._AVERAGE_SPEED_LAST_SECONDS; i++) {
            averageSecondsAverageSpeed += this._speeds[dateInSeconds - i] || 0;
        }

        for (const key in this._speeds) {
            if (parseInt(key) < dateInSeconds - TransferStatistics._AVERAGE_SPEED_LAST_SECONDS) {
                delete this._speeds[key];
            }
        }

        return averageSecondsAverageSpeed / TransferStatistics._AVERAGE_SPEED_LAST_SECONDS;
    }

    updateProgress(transferred: number, total: number): TransferProgressInfo {
        const speed = clamp(this._calculateSpeed(transferred), 0);
        const timeLeft = (total - transferred) / speed;
        const timeLeftFinalNumber = clamp((timeLeft || 0) * 1000, 0, MAX_TIME_LEFT);
        const percentage = Number(clamp(((transferred / total) * 100), 0, 100)
            .toFixed(2));

        const timeLeftPretty = prettyMs(timeLeftFinalNumber, TransferStatistics._PRETTY_MS_OPTIONS);

        const formattedTransferred = prettyBytes(clamp(transferred), TransferStatistics._PRETTY_BYTES_OPTIONS);
        const formattedTotal = prettyBytes(clamp(total), TransferStatistics._PRETTY_BYTES_OPTIONS);
        const transferredBytes = `${formattedTransferred}/${formattedTotal}`;

        return this._latestProgress = {
            transferred,
            total,
            speed: TransferStatistics._formatSpeed(speed),
            percentage,
            timeLeft: timeLeftPretty,
            transferredBytes,
            ended: percentage == 100
        };
    }

}
