import UpdateManager from "stdout-update";

export type BaseLoadingAnimationOptions = {
    updateIntervalMs?: number;
    loadingText?: string;
};

export const DEFAULT_LOADING_ANIMATION_OPTIONS: BaseLoadingAnimationOptions = {
    loadingText: "Gathering information"
};

const DEFAULT_UPDATE_INTERVAL_MS = 300;

export default abstract class BaseLoadingAnimation {
    private _intervalId?: NodeJS.Timeout;
    protected options: BaseLoadingAnimationOptions;
    protected stdoutManager = UpdateManager.getInstance();


    protected constructor(options: BaseLoadingAnimationOptions = DEFAULT_LOADING_ANIMATION_OPTIONS) {
        this.options = options;
        this._processExit = this._processExit.bind(this);
    }

    protected _render(): void {
        this.stdoutManager.update([this.createFrame()]);
    }

    protected abstract createFrame(): string;

    start(): void {
        process.on("SIGINT", this._processExit);

        this.stdoutManager.hook();
        this._intervalId = setInterval(
            this._render.bind(this),
            this.options.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS
        );
    }

    stop(): void {
        if (this._intervalId) {
            this.stdoutManager.erase();
            this.stdoutManager.unhook(false);

            clearInterval(this._intervalId);
            this._intervalId = undefined;
            process.off("SIGINT", this._processExit);
        }
    }

    private _processExit() {
        this.stop();
        process.exit(0);
    }
}
