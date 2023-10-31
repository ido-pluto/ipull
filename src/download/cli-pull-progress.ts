import cliProgress from 'cli-progress';
import chalk from 'chalk';
import {IStreamProgress} from './stream-progress/istream-progress.js';
import PullProgress, {TransferProgressInfo} from './pull-progress.js';

export default class CLIPullProgress extends PullProgress {
    private _progressBar: cliProgress.SingleBar;

    public constructor( _progress: IStreamProgress, private _name: string) {
        super(_progress, info => this._handleCLIUpdate(info));
        this._progressBar = new cliProgress.SingleBar({
            format: this._getProgressBarFormat(),
            barCompleteChar: "\u2588",
            barIncompleteChar: "\u2591",
            hideCursor: false
        });
    }

    private _handleCLIUpdate({total, transferred, speed, percentage, timeLeft, transferredBytes, ended}: TransferProgressInfo) {
        this._progressBar.setTotal(total);

        this._progressBar.update(transferred, {
            speed,
            percentage,
            timeLeft,
            transferredBytes
        });

        if (ended) {
            this._progressBar.stop();
            console.log("\nConnecting transferred chunks, please wait...");
        }
    }

    public override async startPull(): Promise<void> {
        this._progressBar.start(Infinity, 0, {
            speed: "N/A",
            percentage: 0,
            timeLeft: "N/A",
            transferredBytes: "0 bytes/0 bytes"
        });

        await super.startPull();
        console.log();
    }

    private _getProgressBarFormat(): string {
        return `Pulling ${this._name} | ${chalk.cyan("{bar}")} | {percentage}% | {transferredBytes} | Speed: {speed} | Time: {timeLeft}`;
    }
}
