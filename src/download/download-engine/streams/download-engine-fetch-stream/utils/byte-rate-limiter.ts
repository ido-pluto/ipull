import {sleepPromise} from "../../../utils/sleepPromise.js";

const DEFAULT_BURST_SECONDS = 0.5;

function nowMs() {
    return globalThis.performance?.now() ?? Date.now();
}

export default class ByteRateLimiter {
    private _nextAvailableAt: number;
    private readonly _burstMs: number;

    constructor(private readonly _bytesPerSecond: number, burstSeconds = DEFAULT_BURST_SECONDS) {
        this._burstMs = burstSeconds * 1000;
        this._nextAvailableAt = nowMs() - this._burstMs;
    }

    public waitFor(bytes: number): Promise<void> | void {
        if (bytes <= 0 || this._bytesPerSecond <= 0) return;

        const now = nowMs();
        const scheduledStart = Math.max(this._nextAvailableAt, now - this._burstMs);
        const scheduledEnd = scheduledStart + bytes / this._bytesPerSecond * 1000;
        this._nextAvailableAt = scheduledEnd;

        const waitMs = scheduledEnd - now;
        if (waitMs > 0) {
            return sleepPromise(waitMs);
        }
    }
}
