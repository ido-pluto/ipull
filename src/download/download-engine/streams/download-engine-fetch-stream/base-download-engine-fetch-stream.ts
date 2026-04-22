import retry from "async-retry";
import {EventEmitter} from "../../../../utils/EventEmitter.js";
import {withLock} from "lifecycle-utils";
import prettyMillisecondsCompact from "../../../transfer-visualize/utils/prettyMSFast.js";
import {AvailablePrograms} from "../../download-file/download-programs/switch-program.js";
import {InputRange} from "../../engine/base-download-engine.js";
import {sleepPromise} from "../../utils/sleepPromise.js";
import HttpError from "./errors/http-error.js";
import StatusCodeError from "./errors/status-code-error.js";
import {retryAsyncStatementSimple} from "./utils/retry-async-statement.js";

export const MIN_LENGTH_FOR_MORE_INFO_REQUEST = 1024 * 1024 * 3; // 3MB

const TOKEN_EXPIRED_ERROR_CODES = [401, 403, 419, 440, 498, 499];

export type BaseDownloadEngineFetchStreamOptions = {
    retry?: retry.Options;
    retryFetchDownloadInfo?: retry.Options;
    range?: InputRange;
    /**
     * Interval read data and check if stream is not responding (default: 1s)
     */
    streamCheckInterval?: number;
    /**
     * Max wait for stream to respond with data before raising stream not responding event (default: 3s)
     */
    streamWaitAlert?: number;
    /**
     * Max wait for next data stream before aborting and retrying (default: 15s)
     */
    maxStreamWait?: number;
    /**
     * Max wait for server to respond with headers (default: 30s)
     */
    headersTimeout?: number;
    /**
     * If true, the engine will retry the request if the server returns a status code between 500 and 599
     */
    retryOnServerError?: boolean;
    headers?: Record<string, string>;
    /**
     * If true, parallel download will be enabled even if the server does not return `accept-range` header, this is good when using cross-origin requests
     */
    acceptRangeIsKnown?: boolean;
    ignoreIfRangeWithQueryParams?: boolean;
    /**
     * Reduce async operation by getting data from the stream less often
     */
    progressThrottleMs?: number;
} & (
        {
            defaultFetchDownloadInfo?: { length: number, acceptRange: boolean; };
        } |
        {
            /**
             * Try different headers to see if any authentication is needed
             */
            tryHeaders?: Record<string, string>[];
            /**
             * Delay between trying different headers
             */
            tryHeadersDelay?: number;
        });

export type DownloadInfoResponse = {
    length: number,
    acceptRange: boolean,
    newURL?: string,
    fileName?: string;
};

export type FetchSubState = {
    startChunk: number,
    endChunk: number,
    lastChunkEndsFile: boolean,
    chunkSize: number,
    onProgress?: (downloadSize: number) => void,
    activePart: {
        remoteFileSize: number;
        downloadSize: number,
        acceptRange?: boolean,
        downloadURL: string,
        originalURL: string,
        downloadURLUpdateDate: number;
    };
};

export type BaseDownloadEngineFetchStreamEvents = {
    paused: () => void;
    resumed: () => void;
    aborted: () => void;
    errorCountIncreased: (errorCount: number, error: Error) => void;
    retryingOn: (error: Error, attempt: number) => void;
    retryingOff: () => void;
    streamNotRespondingOn: () => void;
    streamNotRespondingOff: () => void;
};

export type WriteCallback = (data: Uint8Array[], position: number, index: number, totalLength: number) => void;

const DEFAULT_OPTIONS: BaseDownloadEngineFetchStreamOptions = {
    retryOnServerError: true,
    streamCheckInterval: 10,
    streamWaitAlert: 1000 * 3,
    maxStreamWait: 1000 * 15,
    headersTimeout: 1000 * 30,
    retry: {
        retries: 50,
        factor: 1.5,
        minTimeout: 200,
        maxTimeout: 5_000
    },
    retryFetchDownloadInfo: {
        retries: 5,
        factor: 1.5,
        minTimeout: 200,
        maxTimeout: 5_000
    },
    tryHeadersDelay: 50,
    range: {
        start: 0,
        end: -1
    }
};

export default abstract class BaseDownloadEngineFetchStream extends EventEmitter<BaseDownloadEngineFetchStreamEvents> {
    public readonly defaultProgramType?: AvailablePrograms;
    public readonly availablePrograms: AvailablePrograms[] = ["chunks", "stream"];
    public readonly abstract transferAction: string;
    public readonly supportDynamicStreamLength: boolean = false;
    public readonly options: Partial<BaseDownloadEngineFetchStreamOptions> = {};
    public noRangeFetchSize = 0;
    public state: FetchSubState = null!;
    public paused?: Promise<void>;
    public aborted = false;
    protected _pausedResolve?: () => void;
    protected _cleanupClonedStateListeners?: () => void;
    public errorCount = {value: 0};
    public lastFetchTime = 0;
    private _closed = false;
    private _watchDogCalls = new Set<() => void>();
    private _watchDogInterval?: NodeJS.Timeout;

    constructor(options: Partial<BaseDownloadEngineFetchStreamOptions> = {}) {
        super();
        this.options = {...DEFAULT_OPTIONS, ...options};
        this.watchDog = this.watchDog.bind(this);
        this.initEvents();
    }

    protected get _startSize() {
        return this.state.startChunk * this.state.chunkSize + this.options.range!.start;
    }

    protected get _endSize() {
        const rangeEnd = this.options.range!.end >= 0 ? this.options.range!.end + 1 : Infinity;
        return Math.min(this.state.endChunk * this.state.chunkSize + this.options.range!.start, rangeEnd, this.state.activePart.remoteFileSize);
    }

    protected initEvents() {
        this.on("aborted", () => {
            this.aborted = true;
            this.paused = undefined;
            this._pausedResolve?.();
        });

        this.on("paused", () => {
            this.paused = new Promise((resolve) => {
                this._pausedResolve = resolve;
            });
        });

        this.on("resumed", () => {
            this._pausedResolve?.();
            this._pausedResolve = undefined;
            this.paused = undefined;
        });
    }

    abstract withSubState(state: FetchSubState): this;

    protected cloneState<Fetcher extends BaseDownloadEngineFetchStream>(state: FetchSubState, fetchStream: Fetcher): Fetcher {
        fetchStream.state = state;
        fetchStream.errorCount = this.errorCount;
        const forwardErrorCount = this.emit.bind(this, "errorCountIncreased");
        const forwardAborted = fetchStream.emit.bind(fetchStream, "aborted");
        const forwardPaused = fetchStream.emit.bind(fetchStream, "paused");
        const forwardResumed = fetchStream.emit.bind(fetchStream, "resumed");

        fetchStream.on("errorCountIncreased", forwardErrorCount);
        this.on("aborted", forwardAborted);
        this.on("paused", forwardPaused);
        this.on("resumed", forwardResumed);

        fetchStream._cleanupClonedStateListeners = () => {
            fetchStream.off("errorCountIncreased", forwardErrorCount);
            this.off("aborted", forwardAborted);
            this.off("paused", forwardPaused);
            this.off("resumed", forwardResumed);
            fetchStream._cleanupClonedStateListeners = undefined;
        };

        this.watchDog = fetchStream.watchDog;

        return fetchStream;
    }

    public async fetchDownloadInfo(url: string): Promise<DownloadInfoResponse> {
        let throwErr: Error | null = null;

        const tryHeaders = "tryHeaders" in this.options && this.options.tryHeaders ? this.options.tryHeaders.slice() : [];
        let retryingOn = false;

        const fetchDownloadInfoCallback = async (): Promise<DownloadInfoResponse | null> => {
            try {
                const response = await this.fetchDownloadInfoWithoutRetry(url);
                if (retryingOn) {
                    retryingOn = false;
                    this.emit0("retryingOff");
                }
                return response;
            } catch (error: any) {
                if (error?.name === "AbortError" && this.aborted) {
                    throwErr = error;
                    return null;
                }

                this.errorCount.value++;
                this.emit2("errorCountIncreased", this.errorCount.value, error);

                if (error instanceof HttpError && !this.retryOnServerError(error)) {
                    if ("tryHeaders" in this.options && tryHeaders.length) {
                        this.options.headers = tryHeaders.shift();
                        retryingOn = true;
                        this.emit2("retryingOn", error, this.errorCount.value);
                        await sleepPromise(this.options.tryHeadersDelay ?? 0);
                        return await fetchDownloadInfoCallback();
                    }

                    throwErr = error;
                    return null;
                }

                if (error instanceof StatusCodeError && error.retryAfter) {
                    retryingOn = true;
                    this.emit2("retryingOn", error, this.errorCount.value);
                    await sleepPromise(error.retryAfter * 1000);
                    return await fetchDownloadInfoCallback();
                }

                throw error;
            }
        };

        const response = ("defaultFetchDownloadInfo" in this.options && this.options.defaultFetchDownloadInfo) || await retry(fetchDownloadInfoCallback, this.options.retryFetchDownloadInfo);
        if (throwErr) {
            throw throwErr;
        }

        return response!;
    }

    protected abstract fetchDownloadInfoWithoutRetry(url: string): Promise<DownloadInfoResponse>;

    public async fetchChunks(callback: WriteCallback) {
        let lastStartLocation = this.state.startChunk;
        let retryResolvers = retryAsyncStatementSimple(this.options.retry);
        let retryingOn = false;

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                try {
                    this.lastFetchTime = Date.now();
                    return await this.fetchWithoutRetryChunks((...args) => {
                        if (retryingOn) {
                            retryingOn = false;
                            this.emit0("retryingOff");
                        }
                        callback(...args);
                    });
                } catch (error: any) {
                    if (error?.name === "AbortError" && this.aborted) return;

                    this.errorCount.value++;
                    this.emit2("errorCountIncreased", this.errorCount.value, error);

                    const needToRecreateURL = this.shouldRecreateURL(error);
                    if (!needToRecreateURL && error instanceof HttpError && !this.retryOnServerError(error)) {
                        throw error;
                    }

                    retryingOn = true;
                    this.emit2("retryingOn", error, this.errorCount.value);
                    if (error instanceof StatusCodeError && error.retryAfter) {
                        await sleepPromise(error.retryAfter * 1000);
                        continue;
                    }

                    if (lastStartLocation !== this.state.startChunk) {
                        lastStartLocation = this.state.startChunk;
                        retryResolvers = retryAsyncStatementSimple(this.options.retry);
                    }

                    await Promise.all([
                        retryResolvers(error),
                        needToRecreateURL && this.recreateDownloadURL()
                    ]);
                }
            }
        } finally {
            this._cleanupClonedStateListeners?.();
        }
    }

    shouldRecreateURL(error: Error): boolean {
        return error instanceof StatusCodeError && TOKEN_EXPIRED_ERROR_CODES.includes(error.statusCode) &&
            this.state.activePart.downloadURL !== this.state.activePart.originalURL;
    }

    recreateDownloadURL() {
        return withLock([this.state.activePart, "_recreateURLLock"], async () => {
            if (this.state.activePart.downloadURLUpdateDate > this.lastFetchTime) {
                return; // The URL was updated while we were waiting for the lock
            }

            const downloadInfo = await this.fetchDownloadInfo(this.state.activePart.originalURL);
            this.state.activePart.downloadURL = downloadInfo.newURL || this.state.activePart.originalURL;
            this.state.activePart.downloadURLUpdateDate = Date.now();
        });
    }

    protected abstract fetchWithoutRetryChunks(callback: WriteCallback): Promise<void> | void;

    public close(): void | Promise<void> {
        if (this._closed) return;
        this._closed = true;

        this._cleanupClonedStateListeners?.();
        this.emit0("aborted");
    }

    protected appendToURL(url: string) {
        const parsed = new URL(url);
        if (this.options.ignoreIfRangeWithQueryParams) {
            const randomText = Math.random()
                .toString(36);
            parsed.searchParams.set("_ignore", randomText);
        }

        return parsed.href;
    }

    protected watchDog(callback: () => void) {
        this._watchDogCalls.add(callback);
        if (!this._watchDogInterval) {            
            this._watchDogInterval = setInterval(() => {
                for (const cb of this._watchDogCalls) {
                    cb();
                }
            }, this.options.streamCheckInterval!);
        }

        return () => {
            this._watchDogCalls.delete(callback);
            if (this._watchDogCalls.size === 0 && this._watchDogInterval) {
                clearInterval(this._watchDogInterval);
                this._watchDogInterval = undefined;
            }
        };
    }

    protected retryOnServerError(error: Error): error is StatusCodeError {
        return Boolean(this.options.retryOnServerError) && error instanceof StatusCodeError &&
            (error.statusCode >= 500 || error.statusCode === 429);
    }

    static timeoutAbortController(timeout: number) {
        const abortController = new AbortController();
        let headersTimeout: null | ReturnType<typeof setTimeout> = setTimeout(() => {
            abortController.abort(`Fetch headers timeout after ${prettyMillisecondsCompact(timeout)}`);
        }, timeout);

        return {
            signal: abortController.signal,
            abort: (reason?: string) => abortController.abort(reason),
            clearAbortTimeout: () => {
                if (headersTimeout != null) {
                    clearTimeout(headersTimeout);
                    headersTimeout = null;
                }
            }
        };
    }
}
