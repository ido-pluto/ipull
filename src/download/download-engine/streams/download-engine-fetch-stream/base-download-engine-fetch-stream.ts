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
    start: number,
    end: number,
    chunkSize: number,
    rangeSupport?: boolean,
    onProgress?: (length: number) => void
};

export type BaseDownloadEngineFetchStreamEvents = {
    paused: () => void
    resumed: () => void
    aborted: () => void
};

export default abstract class BaseDownloadEngineFetchStream extends EventEmitter<BaseDownloadEngineFetchStreamEvents> {
    public readonly abstract transferAction: string;
    public readonly options: Partial<BaseDownloadEngineFetchStreamOptions> = {};
    public state: FetchSubState = null!;
    public paused?: Promise<void>;
    public aborted = false;
    protected _pausedResolve?: () => void;

    constructor(options: Partial<BaseDownloadEngineFetchStreamOptions> = {}) {
        super();
        this.options = options;
        this.initEvents();
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

    public async fetchBytes(url: string, start: number, end: number, onProgress?: (length: number) => void) {
        return await retry(async () => {
            return await this.fetchBytesWithoutRetry(url, start, end, onProgress);
        }, this.options.retry);
    }

    protected abstract fetchBytesWithoutRetry(url: string, start: number, end: number, onProgress?: (length: number) => void): Promise<Uint8Array>;

    public async fetchDownloadInfo(url: string): Promise<{ length: number, acceptRange: boolean }> {
        return this.options.defaultFetchDownloadInfo ?? await retry(async () => {
            return await this.fetchDownloadInfoWithoutRetry(url);
        }, this.options.retry);
    }

    protected abstract fetchDownloadInfoWithoutRetry(url: string): Promise<{ length: number, acceptRange: boolean }>;

    public async fetchChunks(callback: (data: Uint8Array, index: number) => void) {
        let lastStartLocation = this.state.start;
        let retryResolvers = retryAsyncStatementSimple(this.options.retry);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                return await this.fetchWithoutRetryChunks(callback);
            } catch (error: any) {
                if (lastStartLocation !== this.state.start) {
                    lastStartLocation = this.state.start;
                    retryResolvers = retryAsyncStatementSimple(this.options.retry);
                }
                await retryResolvers(error);
            }
        }
    }

    protected abstract fetchWithoutRetryChunks(callback: (data: Uint8Array, index: number) => void): Promise<void> | void;

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
