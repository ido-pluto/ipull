import {DownloadEngineFileOptions, DownloadFile} from "../types.js";
import DownloadEngineFile, {DownloadEngineFileEvents} from "../download-engine-file.js";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import UrlInputError from "./error/url-input-error.js";
import Emittery from "emittery";
import ProgressStatisticsBuilder, {TransferProgressWithStatus} from "../../transfer-visualize/progress-statistics-builder.js";
import DownloadAlreadyStartedError from "./error/download-already-started-error.js";

export type InputURLOptions = { partsURL: string[] } | { url: string };
export type BaseDownloadEngineOptions<FetchStrategy = "xhr" | "fetch" | "localFile"> = DownloadEngineFileOptions &
    {
        comment?: string;
        headers?: Record<string, string>;
        acceptRangeIsKnown?: boolean;
        fetchStrategy?: FetchStrategy;
    };

export interface BaseDownloadEngineEvents extends Omit<DownloadEngineFileEvents, "progress"> {
    progress: TransferProgressWithStatus;
}

export default class BaseDownloadEngine extends Emittery<BaseDownloadEngineEvents> {
    public readonly options: BaseDownloadEngineOptions;
    protected readonly _engine: DownloadEngineFile;
    protected _progressStatisticsBuilder = new ProgressStatisticsBuilder();
    protected _downloadStarted = false;

    get file() {
        return this._engine.file;
    }

    get fileSize() {
        return this._engine.file.totalSize;
    }

    protected constructor(engine: DownloadEngineFile, options: BaseDownloadEngineOptions) {
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
        this._downloadStarted = true;
        await this._engine.download();
        await this.close();
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
