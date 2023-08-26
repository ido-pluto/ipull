import prettyBytes, {Options as PrettyBytesOptions} from "pretty-bytes";
import cliProgress from "cli-progress";
import chalk from "chalk";
import prettyMs, {Options as PrettyMsOptions} from "pretty-ms";
import {IStreamProgress} from "./stream-progress/istream-progress.js";

export default class CLIPullProgress {
    private static readonly _PRETTY_MS_OPTIONS: PrettyMsOptions = {millisecondsDecimalDigits: 1, keepDecimalsOnWholeSeconds: true};
    private static readonly _PRETTY_BYTES_OPTIONS: PrettyBytesOptions = {maximumFractionDigits: 2, minimumFractionDigits: 2};
    private static readonly _AVERAGE_SPEED_LAST_SECONDS = 10;

    private _speeds: { [dateInSeconds: number]: number } = [];
    private _progressBar: cliProgress.SingleBar;
    private _lastTransferred = 0;

    public constructor(private _progress: IStreamProgress, private _name: string) {
        this._progressBar = new cliProgress.SingleBar({
            format: this._getProgressBarFormat(),
            barCompleteChar: "\u2588",
            barIncompleteChar: "\u2591",
            hideCursor: false
        });
    }

    private static _formatSpeed(speed: number): string {
        return prettyBytes(Math.min(speed, 9999999999) || 0, CLIPullProgress._PRETTY_BYTES_OPTIONS) + "/s";
    }

    private _calculateSpeed(currentTransferred: number): number {
        const dateInSeconds = Math.floor(Date.now() / 1000);
        this._speeds[dateInSeconds] ??= 0;
        this._speeds[dateInSeconds] += currentTransferred - this._lastTransferred;
        this._lastTransferred = currentTransferred;

        let averageSecondsAverageSpeed = 0;
        for (let i = 0; i < CLIPullProgress._AVERAGE_SPEED_LAST_SECONDS; i++) {
            averageSecondsAverageSpeed += this._speeds[dateInSeconds - i] || 0;
        }

        for (const key in this._speeds) {
            if (parseInt(key) < dateInSeconds - CLIPullProgress._AVERAGE_SPEED_LAST_SECONDS) {
                delete this._speeds[key];
            }
        }

        return averageSecondsAverageSpeed / CLIPullProgress._AVERAGE_SPEED_LAST_SECONDS;
    }

    private _handleProgress(transferred: number, total: number) {
        this._progressBar.setTotal(total);

        const speed = this._calculateSpeed(transferred);
        const timeLeft = (total - transferred) / speed;
        const percentage = ((transferred / total) * 100).toFixed(2);

        this._progressBar.update(transferred, {
            speed: CLIPullProgress._formatSpeed(speed),
            percentage: percentage,
            timeLeft: prettyMs((timeLeft || 0) * 1000, CLIPullProgress._PRETTY_MS_OPTIONS),
            transferredBytes: `${prettyBytes(transferred, CLIPullProgress._PRETTY_BYTES_OPTIONS)}/${prettyBytes(total, CLIPullProgress._PRETTY_BYTES_OPTIONS)}`
        });

        if (percentage === "100") {
            this._progressBar.stop();
            console.log("\nConnecting transferred chunks, please wait...");
        }
    }

    public async startPull(): Promise<void> {
        this._progressBar.start(Infinity, 0, {
            speed: "N/A",
            percentage: 0,
            timeLeft: "N/A",
            transferredBytes: "0 bytes/0 bytes"
        });

        await this._progress.progress(this._handleProgress.bind(this));
        console.log();
    }

    private _getProgressBarFormat(): string {
        return `Pulling ${this._name} | ${chalk.cyan("{bar}")} | {percentage}% | {transferredBytes} | Speed: {speed} | Time: {timeLeft}`;
    }
}
