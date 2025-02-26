import retry from "async-retry";
import {retryAsyncStatementSimple} from "./utils/retry-async-statement.js";
import {EventEmitter} from "eventemitter3";
import {AvailablePrograms} from "../../download-file/download-programs/switch-program.js";
import HttpError from "./errors/http-error.js";
import StatusCodeError from "./errors/status-code-error.js";
import sleep from "sleep-promise";

export const MIN_LENGTH_FOR_MORE_INFO_REQUEST = 1024 * 1024 * 3; // 3MB

export type BaseDownloadEngineFetchStreamOptions = {
    retry?: retry.Options
    retryFetchDownloadInfo?: retry.Options
    /**
     * Max wait for next data stream
     */
    maxStreamWait?: number
    /**
     * If true, the engine will retry the request if the server returns a status code between 500 and 599
     */
    retryOnServerError?: boolean
    headers?: Record<string, string>
    /**
     * If true, parallel download will be enabled even if the server does not return `accept-range` header, this is good when using cross-origin requests
     */
    acceptRangeIsKnown?: boolean
    ignoreIfRangeWithQueryParams?: boolean
} & (
    {
        defaultFetchDownloadInfo?: { length: number, acceptRange: boolean }
    } |
    {
        /**
         * Try different headers to see if any authentication is needed
         */
        tryHeaders?: Record<string, string>[]
        /**
         * Delay between trying different headers
         */
        tryHeadersDelay?: number
    });

export type DownloadInfoResponse = {
    length: number,
    acceptRange: boolean,
    newURL?: string,
    fileName?: string
};

export type FetchSubState = {
    url: string,
    startChunk: number,
    endChunk: number,
    totalSize: number,
    chunkSize: number,
    rangeSupport?: boolean,
    onProgress?: (length: number) => void,
};

export type BaseDownloadEngineFetchStreamEvents = {
    paused: () => void
    resumed: () => void
    aborted: () => void
    errorCountIncreased: (errorCount: number, error: Error) => void
    retryingOn: (error: Error, attempt: number) => void
    retryingOff: () => void
};

export type WriteCallback = (data: Uint8Array[], position: number, index: number) => void;

const DEFAULT_OPTIONS: BaseDownloadEngineFetchStreamOptions = {
    retryOnServerError: true,
    maxStreamWait: 1000 * 3,
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
    tryHeadersDelay: 50
};

export default abstract class BaseDownloadEngineFetchStream extends EventEmitter<BaseDownloadEngineFetchStreamEvents> {
    public readonly defaultProgramType?: AvailablePrograms;
    public readonly availablePrograms: AvailablePrograms[] = ["chunks", "stream"];
    public readonly abstract transferAction: string;
    public readonly supportDynamicStreamLength: boolean = false;
    public readonly options: Partial<BaseDownloadEngineFetchStreamOptions> = {};
    public state: FetchSubState = null!;
    public paused?: Promise<void>;
    public aborted = false;
    protected _pausedResolve?: () => void;
    public errorCount = {value: 0};

    constructor(options: Partial<BaseDownloadEngineFetchStreamOptions> = {}) {
        super();
        this.options = {...DEFAULT_OPTIONS, ...options};
        this.initEvents();
    }

    protected get _startSize() {
        return this.state.startChunk * this.state.chunkSize;
    }

    protected get _endSize() {
        return Math.min(this.state.endChunk * this.state.chunkSize, this.state.totalSize);
    }

    protected initEvents() {
        this.on("aborted", () => {
            this.aborted = true;
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
        fetchStream.on("errorCountIncreased", this.emit.bind(this, "errorCountIncreased"));

        this.on("aborted", fetchStream.emit.bind(fetchStream, "aborted"));
        this.on("paused", fetchStream.emit.bind(fetchStream, "paused"));
        this.on("resumed", fetchStream.emit.bind(fetchStream, "resumed"));

        return fetchStream;
    }

    public async fetchDownloadInfo(url: string): Promise<DownloadInfoResponse> {
        let throwErr: Error | null = null;

        const tryHeaders = "tryHeaders" in this.options && this.options.tryHeaders ? this.options.tryHeaders.slice() : [];

        const fetchDownloadInfoCallback = async (): Promise<DownloadInfoResponse | null> => {
            try {
                const response = await this.fetchDownloadInfoWithoutRetry(url);
                this.emit("retryingOff");
                return response;
            } catch (error: any) {
                this.errorCount.value++;
                this.emit("errorCountIncreased", this.errorCount.value, error);

                if (error instanceof HttpError && !this.retryOnServerError(error)) {
                    if ("tryHeaders" in this.options && tryHeaders.length) {
                        this.options.headers = tryHeaders.shift();
                        this.emit("retryingOn", error, this.errorCount.value);
                        await sleep(this.options.tryHeadersDelay ?? 0);
                        return await fetchDownloadInfoCallback();
                    }

                    throwErr = error;
                    return null;
                }

                if (error instanceof StatusCodeError && error.retryAfter) {
                    this.emit("retryingOn", error, this.errorCount.value);
                    await sleep(error.retryAfter * 1000);
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

        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                const response = await this.fetchWithoutRetryChunks(callback);
                this.emit("retryingOff");
                return response;
            } catch (error: any) {
                if (error?.name === "AbortError") return;
                this.errorCount.value++;
                this.emit("errorCountIncreased", this.errorCount.value, error);

                if (error instanceof HttpError && !this.retryOnServerError(error)) {
                    throw error;
                }

                this.emit("retryingOn", error, this.errorCount.value);
                if (error instanceof StatusCodeError && error.retryAfter) {
                    await sleep(error.retryAfter * 1000);
                    continue;
                }

                if (lastStartLocation !== this.state.startChunk) {
                    lastStartLocation = this.state.startChunk;
                    retryResolvers = retryAsyncStatementSimple(this.options.retry);
                }

                await retryResolvers(error);
            }
        }
    }

    protected abstract fetchWithoutRetryChunks(callback: WriteCallback): Promise<void> | void;

    public close(): void | Promise<void> {
        this.emit("aborted");
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

    protected retryOnServerError(error: Error): error is StatusCodeError {
        return Boolean(this.options.retryOnServerError) && error instanceof StatusCodeError &&
            (error.statusCode >= 500 || error.statusCode === 429);
    }
}
