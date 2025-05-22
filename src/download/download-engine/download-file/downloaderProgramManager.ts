import BaseDownloadProgram from "./download-programs/base-download-program.js";
import DownloadEngineFile from "./download-engine-file.js";
import {DownloadStatus, ProgressStatus} from "./progress-status-file.js";
import sleep from "sleep-promise";

const BASE_AVERAGE_SPEED_TIME = 1000;
const AVERAGE_SPEED_TIME = 1000 * 8;
const ALLOW_SPEED_DECREASE_PERCENTAGE = 10;
const ADD_MORE_PARALLEL_IF_SPEED_INCREASE_PERCENTAGE = 10;

export class DownloaderProgramManager {
    // date, speed
    private _speedHistory: [number, number][] = [];
    private _lastResumeDate = 0;
    private _lastAverageSpeed = 0;
    private _increasePaused = false;
    protected _removeEvent?: () => void;

    constructor(protected _program: BaseDownloadProgram, protected _download: DownloadEngineFile) {
        this._initEvents();
    }

    private _initEvents() {
        let lastTransferredBytes = 0;
        let lastTransferredBytesDate = 0;

        let watNotActive = true;
        const progressEvent = (event: ProgressStatus) => {
            const now = Date.now();

            if (event.retrying || event.downloadStatus != DownloadStatus.Active) {
                watNotActive = true;
            } else {
                if (watNotActive) {
                    this._lastResumeDate = now;
                    watNotActive = false;
                }

                const isTimeToCalculate = lastTransferredBytesDate + BASE_AVERAGE_SPEED_TIME < now;
                if (lastTransferredBytesDate === 0 || isTimeToCalculate) {
                    if (isTimeToCalculate) {
                        const speedPerSec = event.transferredBytes - lastTransferredBytes;
                        this._speedHistory.push([now, speedPerSec]);
                    }

                    lastTransferredBytesDate = now;
                    lastTransferredBytes = event.transferredBytes;
                }

            }

            const deleteAllBefore = now - AVERAGE_SPEED_TIME;
            this._speedHistory = this._speedHistory.filter(([date]) => date > deleteAllBefore);


            if (!watNotActive && now - this._lastResumeDate > AVERAGE_SPEED_TIME) {
                this._checkAction();
            }
        };

        this._download.on("progress", progressEvent);
        this._removeEvent = () => this._download.off("progress", progressEvent);
    }

    private _calculateAverageSpeed() {
        const totalSpeed = this._speedHistory.reduce((acc, [, speed]) => acc + speed, 0);
        return totalSpeed / (this._speedHistory.length || 1);
    }

    private async _checkAction() {
        const lastAverageSpeed = this._lastAverageSpeed;
        const newAverageSpeed = this._calculateAverageSpeed();
        const speedDecreasedOK = (lastAverageSpeed - newAverageSpeed) / newAverageSpeed * 100 > ALLOW_SPEED_DECREASE_PERCENTAGE;

        if (!speedDecreasedOK) {
            this._lastAverageSpeed = newAverageSpeed;
        }

        if (this._increasePaused || newAverageSpeed > lastAverageSpeed || speedDecreasedOK) {
            return;
        }

        this._increasePaused = true;
        this._program.incParallelStreams();
        let sleepTime = AVERAGE_SPEED_TIME;

        while (sleepTime <= AVERAGE_SPEED_TIME) {
            await sleep(sleepTime);
            sleepTime = Date.now() - this._lastResumeDate;
        }

        const newSpeed = this._calculateAverageSpeed();
        const bestLastSpeed = Math.max(newAverageSpeed, lastAverageSpeed);
        const speedIncreasedOK = newSpeed > bestLastSpeed && (newSpeed - bestLastSpeed) / bestLastSpeed * 100 > ADD_MORE_PARALLEL_IF_SPEED_INCREASE_PERCENTAGE;

        if (speedIncreasedOK) {
            this._increasePaused = false;
        } else {
            this._program.decParallelStreams();
        }
    }

    close() {
        this._removeEvent?.();
    }
}
