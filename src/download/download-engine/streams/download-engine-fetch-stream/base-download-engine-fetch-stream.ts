import retry from "async-retry";

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

export default abstract class BaseDownloadEngineFetchStream {
    constructor(public readonly options: Partial<BaseDownloadEngineFetchStreamOptions> = {}) {
    }

    public async fetchBytes(url: string, start: number, end: number, onProgress?: (length: number) => void) {
        return await retry(async () => {
            return await this._fetchBytesWithoutRetry(url, start, end, onProgress);
        }, this.options.retry);
    }

    protected abstract _fetchBytesWithoutRetry(url: string, start: number, end: number, onProgress?: (length: number) => void): Promise<Uint8Array>;

    public async fetchDownloadInfo(url: string): Promise<{ length: number, acceptRange: boolean }> {
        return this.options.defaultFetchDownloadInfo ?? await retry(async () => {
            return await this._fetchDownloadInfoWithoutRetry(url);
        }, this.options.retry);
    }

    protected abstract _fetchDownloadInfoWithoutRetry(url: string): Promise<{ length: number, acceptRange: boolean }>;

    public close(): void | Promise<void> {
    }

    protected _appendToURL(url: string) {
        const parsed = new URL(url);
        if (this.options.ignoreIfRangeWithQueryParams) {
            const randomText = Math.random()
                .toString(36);
            parsed.searchParams.set("_ignore", randomText);
        }

        return parsed.href;
    }
}
