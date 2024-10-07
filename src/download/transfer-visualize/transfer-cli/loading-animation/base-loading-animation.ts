import UpdateManager from "stdout-update";
import sleep from "sleep-promise";
import {CLIProgressPrintType} from "../multiProgressBars/BaseMultiProgressBar.js";

export type BaseLoadingAnimationOptions = {
    updateIntervalMs?: number | null;
    loadingText?: string;
    logType: CLIProgressPrintType
};

export const DEFAULT_LOADING_ANIMATION_OPTIONS: BaseLoadingAnimationOptions = {
    loadingText: "Gathering information",
    logType: "update"
};

const DEFAULT_UPDATE_INTERVAL_MS = 300;

export default abstract class BaseLoadingAnimation {
    protected options: BaseLoadingAnimationOptions;
    protected stdoutManager = UpdateManager.getInstance();
    protected _animationActive = false;


    protected constructor(options: BaseLoadingAnimationOptions = DEFAULT_LOADING_ANIMATION_OPTIONS) {
        this.options = options;
        this._processExit = this._processExit.bind(this);
    }

    protected _render(): void {
        const frame = this.createFrame();

        if (this.options.logType === "update") {
            this.stdoutManager.update([frame]);
        } else {
            console.log(frame);
        }
    }

    protected abstract createFrame(): string;

    async start() {
        process.on("SIGINT", this._processExit);

        if (this.options.logType === "update") {
            this.stdoutManager.hook();
        }

        this._animationActive = true;
        while (this._animationActive) {
            this._render();
            await sleep(this.options.updateIntervalMs || DEFAULT_UPDATE_INTERVAL_MS);
        }
    }

    stop(): void {
        if (!this._animationActive) {
            return;
        }

        this._animationActive = false;

        if (this.options.logType === "update") {
            this.stdoutManager.erase();
            this.stdoutManager.unhook(false);
        }

        process.off("SIGINT", this._processExit);
    }

    private _processExit() {
        this.stop();
        process.exit(0);
    }
}
