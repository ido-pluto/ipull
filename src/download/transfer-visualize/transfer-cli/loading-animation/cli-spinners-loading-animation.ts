import BaseLoadingAnimation, {BaseLoadingAnimationOptions, DEFAULT_LOADING_ANIMATION_OPTIONS} from "./base-loading-animation.js";
import {Spinner} from "cli-spinners";

export default class CliSpinnersLoadingAnimation extends BaseLoadingAnimation {
    private _spinner: Spinner;
    private _frameIndex = 0;

    public constructor(spinner: Spinner, options: BaseLoadingAnimationOptions) {
        options = {...DEFAULT_LOADING_ANIMATION_OPTIONS, ...options};
        options.updateIntervalMs ??= spinner.interval;
        super(options);
        this._spinner = spinner;
    }

    protected createFrame(): string {
        const frame = this._spinner.frames[this._frameIndex];
        this._frameIndex++;
        if (this._frameIndex >= this._spinner.frames.length) {
            this._frameIndex = 0;
        }
        return `${frame} ${this.options.loadingText}`;
    }
}
