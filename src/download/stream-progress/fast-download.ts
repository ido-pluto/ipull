import TurboDownloader, {TurboDownloaderOptions} from 'turbo-downloader';
import wretch from 'wretch';
import fs from 'fs-extra';
import contentDisposition from 'content-disposition';
import {IStreamProgress} from './istream-progress.js';

const DEFAULT_FILE_NAME = "file";

export default class FastDownload implements IStreamProgress {
    private _downloader?: TurboDownloader.default;
    private _redirectedURL?: string;

    constructor(private _url: string, private _savePath: string, private _options?:  Partial<TurboDownloaderOptions>) {
    }

    public async init() {
        await this._fetchFileInfo();
        await fs.ensureFile(this._savePath);

        this._downloader = new FastDownload._TurboDownloaderClass({
            url: this._redirectedURL!,
            destFile: this._savePath,
            chunkSize: 50 * 1024 * 1024,
            concurrency: 8,
            canBeResumed: true,
            ...this._options
        });
    }

    private async _fetchFileInfo() {
        const {url} = await wretch(this._url)
            .head()
            .res()
            .catch(error => {
                throw new Error(`Error while getting file head: ${error.status}`);
            });

        this._redirectedURL = url;


    }

    public async progress(callback: (progressBytes: number, totalBytes: number) => void) {
        if (!this._downloader) throw new Error("Downloader is not initialized");
        await (this._downloader as any).download(callback);
    }

    private static get _TurboDownloaderClass(): typeof TurboDownloader.default {
        if (TurboDownloader && "default" in TurboDownloader) return TurboDownloader.default;
        return TurboDownloader;
    }

    /**
     * Fetches filename from `content-disposition` header. If it's not present, extract it from the `pathname` of the url
     * @param {string} url
     */
    public static async fetchFilename(url: string) {
        const contentDispositionHeader = await wretch(url)
            .head()
            .res(response => response.headers.get("content-disposition"))
            .catch(error => {
                throw new Error(`Error while getting file head: ${error.status}`);
            });

        const parsed = new URL(url);
        const defaultFilename = decodeURIComponent(parsed.pathname.split("/").pop() ?? DEFAULT_FILE_NAME);

        if (!contentDispositionHeader)
            return defaultFilename;

        const {parameters} = contentDisposition.parse(contentDispositionHeader);
        return parameters.filename ?? defaultFilename;
    }
}
