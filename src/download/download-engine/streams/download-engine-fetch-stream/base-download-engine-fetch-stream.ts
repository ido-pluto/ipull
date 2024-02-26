import retry from "async-retry";

export type BaseDownloadEngineFetchStreamOptions = {
    retry?: retry.Options
    headers?: Record<string, string>,
    /**
     * If true, parallel download will be enabled even if the server does not return `accept-range` header, this is good when using cross-origin requests
     */
    acceptRangeAlwaysTrue?: boolean
    defaultFetchDownloadInfo?: { length: number, acceptRange: boolean }
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
}
