import logUpdate from "log-update";

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

    protected constructor(options: BaseLoadingAnimationOptions = DEFAULT_LOADING_ANIMATION_OPTIONS) {
        this.options = options;
    }

    protected _render(): void {
        logUpdate(this.createFrame());
    }

    protected abstract createFrame(): string;

    start(): void {
        this._intervalId = setInterval(
            this._render.bind(this),
            this.options.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS
        );
    }

    stop(): void {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = undefined;
        }
    }
}
