import filenamify from "filenamify";
import fs from "fs/promises";
import path from "path";
import DownloadEngineFile from "../download-file/download-engine-file.js";
import {DownloadStatus} from "../download-file/progress-status-file.js";
import DownloadEngineFetchStreamFetch from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFetchStreamLocalFile from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-local-file.js";
import DownloadEngineWriteStreamNodejs from "../streams/download-engine-write-stream/download-engine-write-stream-nodejs.js";
import BaseDownloadEngine, {BaseDownloadEngineOptions, DEFAULT_BASE_DOWNLOAD_ENGINE_OPTIONS, FullPartURLInternal} from "./base-download-engine.js";
import SavePathError from "./error/save-path-error.js";

export const PROGRESS_FILE_EXTENSION = ".ipull";

type PathOptions = { directory: string; } | { savePath: string; };
export type DownloadEngineOptionsNodejs = PathOptions & BaseDownloadEngineOptions & {
    fileName?: string;
    fetchStrategy?: "local" | "remote";
    skipExisting?: boolean;
    debounceWrite?: {
        maxTime: number;
        maxSize: number;
    };
};

export type DownloadEngineOptionsNodejsCustomFetch = DownloadEngineOptionsNodejs & {
    fullPartURLInternal: FullPartURLInternal[];
};

export type DownloadEngineOptionsNodejsConstructor<WriteStream = DownloadEngineWriteStreamNodejs> =
    DownloadEngineOptionsNodejsCustomFetch
    & {
        writeStream: WriteStream;
    };

/**
 * Download engine for Node.js
 */
export default class DownloadEngineNodejs<T extends DownloadEngineWriteStreamNodejs = DownloadEngineWriteStreamNodejs> extends BaseDownloadEngine {
    public override readonly options: DownloadEngineOptionsNodejsConstructor<T>;

    protected constructor(engine: DownloadEngineFile, _options: DownloadEngineOptionsNodejsConstructor<T>) {
        super(engine, _options);
        this.options = _options;
    }

    protected override _initEvents() {
        super._initEvents();

        this._engine.options.onSaveProgress = (progress) => {
            if (this.options.skipExisting) return;
            this.options.writeStream.saveMetadataAfterFlush(progress);
        };

        this._engine.options.onPausedAsync = async () => {
            await this.options.writeStream.ensureBytesSynced();
        };

        // Try to clone the file if it's a single part download
        this._engine.options.onStartedAsync = async () => {
            if (this.options.skipExisting || this.options.fetchStrategy !== "local" || this.options.fullPartURLInternal.length !== 1 || this.options.fullPartURLInternal[0].range) return;

            try {
                const {reflinkFile} = await import("@reflink/reflink");

                try {
                    await fs.unlink(this.options.writeStream.path);
                } catch { }
                await reflinkFile(this.options.fullPartURLInternal[0].url, this.options.writeStream.path);
                this._engine.finished("cloned");
            } catch { }
        };

        this._engine.options.onFinishAsync = async () => {
            if (this.options.skipExisting) return;
            await this.options.writeStream.ftruncate(this.downloadSize);
        };

        this._engine.options.onCloseAsync = async () => {
            if (this.status.ended && this.options.writeStream.path != this.options.writeStream.finalPath) {
                await fs.rename(this.options.writeStream.path, this.options.writeStream.finalPath);
                this.options.writeStream.path = this.options.writeStream.finalPath;
            }
        };

        if (this.options.skipExisting) {
            this.options.writeStream.path = this.options.writeStream.finalPath;
        }
    }

    /**
     * The file path with the progress extension or the final file path if the download is finished
     */
    public get fileAbsolutePath() {
        return path.resolve(this.options.writeStream.path);
    }

    /**
     * The final file path (without the progress extension)
     */
    public get finalFileAbsolutePath() {
        return path.resolve(this.options.writeStream.finalPath);
    }

    /**
     * Abort the download & delete the file (**even if** the download is finished)
     * @deprecated use `close` with flag `deleteFile` instead
     *
     * TODO: remove in the next major version
     */
    public async closeAndDeleteFile() {
        await this.close({deleteFile: true});
    }

    /**
     * Close the download engine
     * @param deleteTempFile {boolean} - delete the temp file (when the download is **not finished**).
     * @param deleteFile {boolean} - delete the **temp** or **final file** (clean everything up).
     */
    override async close({deleteTempFile, deleteFile}: { deleteTempFile?: boolean, deleteFile?: boolean; } = {}): Promise<void> {
        await super.close();

        if (deleteFile || deleteTempFile && this.status.downloadStatus != DownloadStatus.Finished) {
            try {
                await fs.unlink(this.fileAbsolutePath);
            } catch { }
        }
    }

    /**
     * Download/copy a file
     *
     * if `fetchStrategy` is defined as "localFile" it will copy the file, otherwise it will download it
     * By default, it will guess the strategy based on the URL
     */
    public static async createFromOptions(options: DownloadEngineOptionsNodejs) {
        options = Object.assign({}, DEFAULT_BASE_DOWNLOAD_ENGINE_OPTIONS, options);

        DownloadEngineNodejs._validateOptions(options);

        const fullPartURLInternal = DownloadEngineNodejs._createFullPartURLs(options).map(part => {
            const fetchStrategy = part.fetchStream || options.fetchStrategy || DownloadEngineNodejs._guessFetchStrategy(part.url);
            const fetchStream = part.fetchStream || (
                fetchStrategy === "local" ?
                    new DownloadEngineFetchStreamLocalFile(part) :
                    new DownloadEngineFetchStreamFetch(part)
            );
            return {...part, fetchStream};
        });

        return DownloadEngineNodejs._createFromOptionsWithCustomFetch({...options, fullPartURLInternal});
    }

    protected static async _createFromOptionsWithCustomFetch(options: DownloadEngineOptionsNodejsCustomFetch) {
        const downloadFile = await DownloadEngineNodejs._createDownloadFile(options.fullPartURLInternal, options);
        let downloadLocation = "", fileName = "";

        if ("savePath" in options) {
            downloadLocation = options.savePath;
            fileName = path.basename(options.savePath);
        } else {
            fileName = filenamify(options.fileName || downloadFile.localFileName);
            downloadLocation = path.join(options.directory, fileName);
        }

        downloadFile.localFileName = fileName;

        const writeStream = new DownloadEngineWriteStreamNodejs(downloadLocation + PROGRESS_FILE_EXTENSION, downloadLocation, options);
        writeStream.fileSize = downloadFile.totalSize;

        downloadFile.downloadProgress = await writeStream.loadMetadataAfterFileWithoutRetry();

        if (options.skipExisting) {
            options.skipExisting = false;
            if (downloadFile.totalSize > 0 && !downloadFile.downloadProgress) {
                try {
                    const stat = await fs.stat(downloadLocation);
                    if (stat.isFile() && stat.size === downloadFile.totalSize) {
                        options.skipExisting = true;
                    }
                } catch { }
            }
        }

        const allOptions: DownloadEngineOptionsNodejsConstructor = {...options, writeStream};
        const engine = new DownloadEngineFile(downloadFile, allOptions);
        return new DownloadEngineNodejs(engine, allOptions);
    }

    protected static override _validateOptions(options: DownloadEngineOptionsNodejs) {
        super._validateOptions(options);

        if (!("directory" in options) && !("savePath" in options)) {
            throw new SavePathError("Either `directory` or `savePath` must be provided");
        }

        if ("directory" in options && "savePath" in options) {
            throw new SavePathError("Both `directory` and `savePath` cannot be provided");
        }

        DownloadEngineNodejs._validateURL(options);
    }

    protected static _guessFetchStrategy(url: string) {
        try {
            new URL(url);
            return "remote";
        } catch { }

        return "local";
    }
}
