import path from "path";
import {DownloadFile} from "../types.js";
import DownloadEngineFile from "../download-file/download-engine-file.js";
import DownloadEngineFetchStreamFetch from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineWriteStreamNodejs from "../streams/download-engine-write-stream/download-engine-write-stream-nodejs.js";
import DownloadEngineFetchStreamLocalFile from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-local-file.js";
import BaseDownloadEngine, {BaseDownloadEngineOptions} from "./base-download-engine.js";
import SavePathError from "./error/save-path-error.js";
import fs from "fs-extra";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import filenamify from "filenamify";

export const PROGRESS_FILE_EXTENSION = ".ipull";

type PathOptions = { directory: string } | { savePath: string };
export type DownloadEngineOptionsNodejs = PathOptions & BaseDownloadEngineOptions & {
    fileName?: string;
    fetchStrategy?: "localFile" | "fetch";
    skipExisting?: boolean;
};

export type DownloadEngineOptionsNodejsCustomFetch = DownloadEngineOptionsNodejs & {
    partURLs: string[];
    fetchStream: BaseDownloadEngineFetchStream
};

export type DownloadEngineOptionsNodejsConstructor<WriteStream = DownloadEngineWriteStreamNodejs> =
    DownloadEngineOptionsNodejsCustomFetch
    & {
    writeStream: WriteStream
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

        this._engine.options.onSaveProgressAsync = async (progress) => {
            if (this.options.skipExisting) return;
            await this.options.writeStream.saveMedataAfterFile(progress);
        };

        // Try to clone the file if it's a single part download
        this._engine.options.onStartedAsync = async () => {
            if (this.options.skipExisting || this.options.fetchStrategy !== "localFile" || this.options.partURLs.length !== 1) return;

            try {
                const {reflinkFile} = await import("@reflink/reflink");

                await fs.remove(this.options.writeStream.path);
                await reflinkFile(this.options.partURLs[0], this.options.writeStream.path);
                this._engine.finished("cloned");
            } catch {}
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
     * Abort the download & delete the file (if it exists)
     */
    public async closeAndDeleteFile() {
        await this.close();
        try {
            await fs.unlink(this.fileAbsolutePath);
        } catch {}
    }

    /**
     * Download/copy a file
     *
     * if `fetchStrategy` is defined as "localFile" it will copy the file, otherwise it will download it
     * By default, it will guess the strategy based on the URL
     */
    public static async createFromOptions(options: DownloadEngineOptionsNodejs) {
        DownloadEngineNodejs._validateOptions(options);
        const partURLs = "partURLs" in options ? options.partURLs : [options.url];

        options.fetchStrategy ??= DownloadEngineNodejs._guessFetchStrategy(partURLs[0]);
        const fetchStream = options.fetchStrategy === "localFile" ?
            new DownloadEngineFetchStreamLocalFile(options) :
            new DownloadEngineFetchStreamFetch(options);

        return DownloadEngineNodejs._createFromOptionsWithCustomFetch({...options, partURLs, fetchStream});
    }

    protected static async _createFromOptionsWithCustomFetch(options: DownloadEngineOptionsNodejsCustomFetch) {
        const downloadFile = await DownloadEngineNodejs._createDownloadFile(options.partURLs, options.fetchStream);
        const downloadLocation = DownloadEngineNodejs._createDownloadLocation(downloadFile, options);
        downloadFile.localFileName = path.basename(downloadLocation);

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
                } catch {}
            }
        }

        const allOptions: DownloadEngineOptionsNodejsConstructor = {...options, writeStream};
        const engine = new DownloadEngineFile(downloadFile, allOptions);
        return new DownloadEngineNodejs(engine, allOptions);
    }

    protected static _createDownloadLocation(download: DownloadFile, options: DownloadEngineOptionsNodejs) {
        if ("savePath" in options) {
            return options.savePath;
        }

        const fileName = options.fileName || download.localFileName;
        return path.join(options.directory, filenamify(fileName));
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
            return "fetch";
        } catch {}

        return "localFile";
    }
}
