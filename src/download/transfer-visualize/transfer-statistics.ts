import {clamp} from "../../utils/numbers.js";

export type TransferProgressInfo = {
    transferred: number,
    total: number,
    speed: number,
    percentage: number,
    timeLeft: number,
    ended: boolean
};

const MAX_TIME_LEFT = 35 * 24 * 60 * 60 * 1000; // 35 days

/**
 * Class to calculate transfer statistics, such as speed, percentage, time left, etc.
 * @example
 * You need to call `updateProgress` on every progress update to get the latest statistics.
 * ```ts
 * const statistics = new TransferStatistics();
 * const progress = statistics.updateProgress(100, 1000); // { speed: 100, percentage: 10, timeLeft: 900 ...}
 * console.log(progress);
 * ```
 */
export default class TransferStatistics {
    protected static readonly _AVERAGE_SPEED_LAST_SECONDS = 10;

    private _speeds: { [dateInSeconds: number]: number } = [];
    private _lastTransferred = 0;
    private _latestProgress?: TransferProgressInfo;

    get latestProgress() {
        return this._latestProgress;
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

        return this._latestProgress = {
            transferred: clamp(transferred),
            total: clamp(total),
            speed,
            percentage,
            timeLeft: timeLeftFinalNumber,
            ended: percentage == 100
        };
    }
}
