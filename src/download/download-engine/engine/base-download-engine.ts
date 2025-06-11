import {DownloadFile, SaveProgressInfo} from "../types.js";
import DownloadEngineFile, {DownloadEngineFileOptions} from "../download-file/download-engine-file.js";
import BaseDownloadEngineFetchStream, {BaseDownloadEngineFetchStreamOptions} from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import UrlInputError from "./error/url-input-error.js";
import {EventEmitter} from "eventemitter3";
import ProgressStatisticsBuilder from "../../transfer-visualize/progress-statistics-builder.js";
import retry from "async-retry";
import {AvailablePrograms} from "../download-file/download-programs/switch-program.js";
import StatusCodeError from "../streams/download-engine-fetch-stream/errors/status-code-error.js";
import {InvalidOptionError} from "./error/InvalidOptionError.js";
import {FormattedStatus} from "../../transfer-visualize/format-transfer-status.js";
import {promiseWithResolvers} from "../utils/promiseWithResolvers.js";

const IGNORE_HEAD_STATUS_CODES = [405, 501, 404];
export type InputURLOptions = { partURLs: string[] } | { url: string };

export type CreateDownloadFileOptions = {
    reuseRedirectURL?: boolean
};

export type BaseDownloadEngineOptions = CreateDownloadFileOptions & InputURLOptions & BaseDownloadEngineFetchStreamOptions & {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string;
    programType?: AvailablePrograms,
    autoIncreaseParallelStreams?: boolean
};

export type BaseDownloadEngineEvents = {
    start: () => void
    paused: () => void
    resumed: () => void
    progress: (progress: FormattedStatus) => void
    save: (progress: SaveProgressInfo) => void
    finished: () => void
    closed: () => void
    [key: string]: any
};

export const DEFAULT_BASE_DOWNLOAD_ENGINE_OPTIONS: Partial<BaseDownloadEngineOptions> = {
    reuseRedirectURL: true
};

export default class BaseDownloadEngine extends EventEmitter<BaseDownloadEngineEvents> {
    public readonly options: DownloadEngineFileOptions;
    protected readonly _engine: DownloadEngineFile;
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();

    /**
     * @internal
     */
    _downloadEndPromise = promiseWithResolvers<void>();
    /**
     * @internal
     */
    _downloadStarted = false;
    protected _latestStatus?: FormattedStatus;

    protected constructor(engine: DownloadEngineFile, options: DownloadEngineFileOptions) {
        super();
        this.options = options;
        this._engine = engine;
        this._progressStatisticsBuilder.add(engine);
        this._initEvents();
    }

    public get file() {
        return this._engine.file;
    }

    public get downloadSize() {
        return this._engine.downloadSize;
    }

    public get fileName() {
        return this.file.localFileName;
    }

    public get status() {
        return this._latestStatus ?? ProgressStatisticsBuilder.oneStatistics(this._engine);
    }

    public get downloadStatues() {
        return [this.status];
    }

    /**
     * @internal
     */
    public get _fileEngineOptions() {
        return this._engine.options;
    }

    protected _initEvents() {
        this._engine.on("start", () => {
            return this.emit("start");
        });
        this._engine.on("save", (info) => {
            return this.emit("save", info);
        });
        this._engine.on("finished", () => {
            return this.emit("finished");
        });
        this._engine.on("closed", () => {
            return this.emit("closed");
        });
        this._engine.on("paused", () => {
            return this.emit("paused");
        });
        this._engine.on("resumed", () => {
            return this.emit("resumed");
        });

        this._progressStatisticsBuilder.on("progress", (status) => {
            this._latestStatus = status;
            this.emit("progress", status);
        });
    }

    async download() {
        if (this._downloadStarted) {
            return this._downloadEndPromise.promise;
        }

        try {
            this._downloadStarted = true;
            const promise = this._engine.download();
            promise
                .then(this._downloadEndPromise.resolve)
                .catch(this._downloadEndPromise.reject);
            await promise;
        } finally {
            await this.close();
        }
    }

    public pause() {
        return this._engine.pause();
    }

    public resume() {
        return this._engine.resume();
    }

    public close() {
        return this._engine.close();
    }

    protected static async _createDownloadFile(parts: string[], fetchStream: BaseDownloadEngineFetchStream, {reuseRedirectURL}: CreateDownloadFileOptions = {}) {
        const localFileName = decodeURIComponent(new URL(parts[0], "https://example").pathname.split("/")
            .pop() || "");
        const downloadFile: DownloadFile = {
            totalSize: 0,
            parts: [],
            localFileName
        };

        downloadFile.parts = await Promise.all(parts.map(async (part, index) => {
            try {
                const {length, acceptRange, newURL, fileName} = await fetchStream.fetchDownloadInfo(part);
                const downloadURL = reuseRedirectURL ? (newURL ?? part) : part;
                const size = length || 0;

                downloadFile.totalSize += size;
                if (index === 0 && fileName) {
                    downloadFile.localFileName = fileName;
                }

                return {
                    downloadURL,
                    originalURL: part,
                    downloadURLUpdateDate: Date.now(),
                    size,
                    acceptRange: size > 0 && acceptRange
                };
            } catch (error: any) {
                if (error instanceof StatusCodeError && IGNORE_HEAD_STATUS_CODES.includes(error.statusCode)) {
                    // if the server does not support HEAD request, we will skip that step
                    return {
                        downloadURL: part,
                        originalURL: part,
                        downloadURLUpdateDate: Date.now(),
                        size: 0,
                        acceptRange: false
                    };
                }
                throw error;
            }
        }));

        return downloadFile;
    }

    protected static _validateURL(options: InputURLOptions) {
        if ("partURLs" in options && "url" in options) {
            throw new UrlInputError("Either `partURLs` or `url` should be provided, not both");
        }
        if (!("partURLs" in options) && !("url" in options)) {
            throw new UrlInputError("Either `partURLs` or `url` should be provided");
        }
    }

    protected static _validateOptions(options: BaseDownloadEngineOptions) {
        if ("tryHeaders" in options && options.tryHeaders?.length && "defaultFetchDownloadInfo" in options) {
            throw new InvalidOptionError("Cannot use `tryHeaders` with `defaultFetchDownloadInfo`");
        }
    }
}
