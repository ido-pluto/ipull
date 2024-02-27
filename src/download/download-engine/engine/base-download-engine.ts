import {DownloadFile, SaveProgressInfo} from "../types.js";
import DownloadEngineFile, {DownloadEngineFileOptions} from "../download-engine-file.js";
import BaseDownloadEngineFetchStream, {
    BaseDownloadEngineFetchStreamOptions
} from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import UrlInputError from "./error/url-input-error.js";
import {EventEmitter} from "eventemitter3";
import ProgressStatisticsBuilder, {TransferProgressWithStatus} from "../../transfer-visualize/progress-statistics-builder.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";
import retry from "async-retry";

export type InputURLOptions = { partsURL: string[] } | { url: string };

export type BaseDownloadEngineOptions = InputURLOptions & BaseDownloadEngineFetchStreamOptions & {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string;
};

export type BaseDownloadEngineEvents = {
    start: () => void
    paused: () => void
    resumed: () => void
    progress: (progress: TransferProgressWithStatus) => void
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

    get file() {
        return this._engine.file;
    }

    get fileSize() {
        return this._engine.file.totalSize;
    }

    protected constructor(engine: DownloadEngineFile, options: DownloadEngineFileOptions) {
        super();
        this.options = options;
        this._engine = engine;
        this._progressStatisticsBuilder.add(engine);
        this._initEvents();
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

    pause() {
        return this._engine.pause();
    }

    resume() {
        return this._engine.resume();
    }

    close() {
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

        for (const part of parts) {
            const {length, acceptRange} = await fetchStream.fetchDownloadInfo(part);
            downloadFile.totalSize += length;
            downloadFile.parts.push({
                downloadURL: part,
                size: length,
                acceptRange
            });
        }

        return downloadFile;
    }

    protected static _validateURL(options: InputURLOptions) {
        if ("partsURL" in options && "url" in options) {
            throw new UrlInputError("Either `partsURL` or `url` should be provided, not both");
        }
        if (!("partsURL" in options) && !("url" in options)) {
            throw new UrlInputError("Either `partsURL` or `url` should be provided");
        }
    }
}
