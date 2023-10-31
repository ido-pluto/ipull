import prettyBytes, {Options as PrettyBytesOptions} from 'pretty-bytes';
import prettyMs, {Options as PrettyMsOptions} from 'pretty-ms';
import {IStreamProgress} from './stream-progress/istream-progress.js';
export {IStreamProgress};

export type TransferProgressInfo = {
    transferred: number,
    total: number,
    speed: string,
    percentage: string,
    timeLeft: string,
    transferredBytes: string,
    ended: boolean
}

export type PullProgressCallback = (info: TransferProgressInfo) => void;

export default class PullProgress {
    protected static readonly _PRETTY_MS_OPTIONS: PrettyMsOptions = {millisecondsDecimalDigits: 1, keepDecimalsOnWholeSeconds: true};
    protected static readonly _PRETTY_BYTES_OPTIONS: PrettyBytesOptions = {maximumFractionDigits: 2, minimumFractionDigits: 2};
    protected static readonly _AVERAGE_SPEED_LAST_SECONDS = 10;

    private _speeds: { [dateInSeconds: number]: number } = [];
    private _lastTransferred = 0;

    public constructor(protected _progress: IStreamProgress, protected _onProgress: PullProgressCallback) {
    }

    private static _formatSpeed(speed: number): string {
        return prettyBytes(Math.min(speed, 9999999999) || 0, PullProgress._PRETTY_BYTES_OPTIONS) + "/s";
    }

    private _calculateSpeed(currentTransferred: number): number {
        const dateInSeconds = Math.floor(Date.now() / 1000);
        this._speeds[dateInSeconds] ??= 0;
        this._speeds[dateInSeconds] += currentTransferred - this._lastTransferred;
        this._lastTransferred = currentTransferred;

        let averageSecondsAverageSpeed = 0;
        for (let i = 0; i < PullProgress._AVERAGE_SPEED_LAST_SECONDS; i++) {
            averageSecondsAverageSpeed += this._speeds[dateInSeconds - i] || 0;
        }

        for (const key in this._speeds) {
            if (parseInt(key) < dateInSeconds - PullProgress._AVERAGE_SPEED_LAST_SECONDS) {
                delete this._speeds[key];
            }
        }

        return averageSecondsAverageSpeed / PullProgress._AVERAGE_SPEED_LAST_SECONDS;
    }

    private _handleProgress(transferred: number, total: number) {
        const speed = this._calculateSpeed(transferred);
        const timeLeft = (total - transferred) / speed;
        const percentage = ((transferred / total) * 100).toFixed(2);

        const timeLeftPretty = prettyMs((timeLeft || 0) * 1000, PullProgress._PRETTY_MS_OPTIONS);
        const transferredBytes = `${prettyBytes(transferred, PullProgress._PRETTY_BYTES_OPTIONS)}/${prettyBytes(total, PullProgress._PRETTY_BYTES_OPTIONS)}`;

        this._onProgress({
            transferred,
            total,
            speed: PullProgress._formatSpeed(speed),
            percentage,
            timeLeft: timeLeftPretty,
            transferredBytes,
            ended: percentage === "100"
        });
    }

    public async startPull(): Promise<void> {
        await this._progress.progress(this._handleProgress.bind(this));
    }
}
