import {DownloadFile, SaveProgressInfo} from "../types.js";
import DownloadEngineFile, {DownloadEngineFileOptions} from "../download-file/download-engine-file.js";
import BaseDownloadEngineFetchStream, {BaseDownloadEngineFetchStreamOptions} from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import UrlInputError from "./error/url-input-error.js";
import {EventEmitter} from "eventemitter3";
import ProgressStatisticsBuilder, {ProgressStatusWithIndex} from "../../transfer-visualize/progress-statistics-builder.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";
import retry from "async-retry";
import {AvailablePrograms} from "../download-file/download-programs/switch-program.js";
import StatusCodeError from "../streams/download-engine-fetch-stream/errors/status-code-error.js";

const IGNORE_HEAD_STATUS_CODES = [405, 501, 404];
export type InputURLOptions = { partURLs: string[] } | { url: string };

export type BaseDownloadEngineOptions = InputURLOptions & BaseDownloadEngineFetchStreamOptions & {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string;
    programType?: AvailablePrograms
};

export type BaseDownloadEngineEvents = {
    start: () => void
    paused: () => void
    resumed: () => void
    progress: (progress: ProgressStatusWithIndex) => void
    save: (progress: SaveProgressInfo) => void
    finished: () => void
    closed: () => void
    [key: string]: any
};

export default class BaseDownloadEngine extends EventEmitter<BaseDownloadEngineEvents> {
    public readonly options: DownloadEngineFileOptions;
    protected readonly _engine: DownloadEngineFile;
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();
    protected _downloadStarted = false;
    protected _latestStatus?: ProgressStatusWithIndex;

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
            return this.emit("progress", status);
        });
    }

    async download() {
        if (this._downloadStarted) {
            throw new DownloadAlreadyStartedError();
        }

        try {
            this._downloadStarted = true;
            await this._engine.download();
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

    protected static async _createDownloadFile(parts: string[], fetchStream: BaseDownloadEngineFetchStream) {
        const localFileName = new URL(parts[0], "https://example").pathname.split("/")
            .pop() || "";
        const downloadFile: DownloadFile = {
            totalSize: 0,
            parts: [],
            localFileName
        };

        let counter = 0;
        for (const part of parts) {
            try {
                const {length, acceptRange, newURL, fileName} = await fetchStream.fetchDownloadInfo(part);
                const downloadURL = newURL ?? part;
                const size = length || 0;

                downloadFile.totalSize += size;
                downloadFile.parts.push({
                    downloadURL,
                    size,
                    acceptRange: size > 0 && acceptRange
                });

                if (counter++ === 0 && fileName) {
                    downloadFile.localFileName = fileName;
                }
            } catch (error: any) {
                if (error instanceof StatusCodeError && IGNORE_HEAD_STATUS_CODES.includes(error.statusCode)) {
                    // if the server does not support HEAD request, we will skip that step
                    downloadFile.parts.push({
                        downloadURL: part,
                        size: 0,
                        acceptRange: false
                    });
                    continue;
                }
                throw error;
            }
        }

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
}
