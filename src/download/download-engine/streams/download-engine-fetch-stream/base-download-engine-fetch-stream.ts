import retry from "async-retry";
import {retryAsyncStatementSimple} from "./utils/retry-async-statement.js";
import {EventEmitter} from "eventemitter3";

export type BaseDownloadEngineFetchStreamOptions = {
    retry?: retry.Options
    headers?: Record<string, string>,
    /**
     * If true, parallel download will be enabled even if the server does not return `accept-range` header, this is good when using cross-origin requests
     */
    acceptRangeIsKnown?: boolean
    defaultFetchDownloadInfo?: { length: number, acceptRange: boolean }
    ignoreIfRangeWithQueryParams?: boolean
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
};

export type WriteCallback = (data: Uint8Array[], position: number, index: number) => void;

export default abstract class BaseDownloadEngineFetchStream extends EventEmitter<BaseDownloadEngineFetchStreamEvents> {
    public readonly abstract transferAction: string;
    public readonly options: Partial<BaseDownloadEngineFetchStreamOptions> = {};
    public state: FetchSubState = null!;
    public paused?: Promise<void>;
    public aborted = false;
    protected _pausedResolve?: () => void;
    public errorCount = {value: 0};

    constructor(options: Partial<BaseDownloadEngineFetchStreamOptions> = {}) {
        super();
        this.options = options;
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

    public async fetchDownloadInfo(url: string): Promise<{ length: number, acceptRange: boolean }> {
        return this.options.defaultFetchDownloadInfo ?? await retry(async () => {
            try {
                return await this.fetchDownloadInfoWithoutRetry(url);
            } catch (error: any) {
                this.errorCount.value++;
                this.emit("errorCountIncreased", this.errorCount.value, error);
                throw error;
            }
        }, this.options.retry);
    }

    protected abstract fetchDownloadInfoWithoutRetry(url: string): Promise<{ length: number, acceptRange: boolean }>;

    public async fetchChunks(callback: WriteCallback) {
        let lastStartLocation = this.state.startChunk;
        let retryResolvers = retryAsyncStatementSimple(this.options.retry);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                return await this.fetchWithoutRetryChunks(callback);
            } catch (error: any) {
                if (error?.name === "AbortError") return;
                if (lastStartLocation !== this.state.startChunk) {
                    lastStartLocation = this.state.startChunk;
                    retryResolvers = retryAsyncStatementSimple(this.options.retry);
                }
                this.errorCount.value++;
                this.emit("errorCountIncreased", this.errorCount.value, error);
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
}
