import path from "path";
import {DownloadFile} from "../types.js";
import DownloadEngineFile from "../download-engine-file.js";
import DownloadEngineFetchStreamFetch from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineWriteStreamNodejs from "../streams/download-engine-write-stream/download-engine-write-stream-nodejs.js";
import DownloadEngineFetchStreamLocalFile from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-local-file.js";
import BaseDownloadEngine, {BaseDownloadEngineOptions, InputURLOptions} from "./base-download-engine.js";
import SavePathError from "./error/save-path-error.js";
import fs from "fs-extra";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";

export const PROGRESS_FILE_EXTENSION = ".ipull";

type PathOptions = { directory: string } | { savePath: string };
export type DownloadEngineOptionsNodejs = Omit<BaseDownloadEngineOptions<"fetch" | "localFile">, "writeStream" | "fetchStream">
    & PathOptions & InputURLOptions & {
    fileName?: string;
};

export type DownloadEngineOptionsNodejsCustomFetch = DownloadEngineOptionsNodejs & {
    partsURL: string[];
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

        this._engine.on("save", async (data) => {
            await this.options.writeStream.saveMedataAfterFile(data);
        });

        this._engine.on("finished", async () => {
            await this.options.writeStream.ftruncate();
        });

        this._engine.on("closed", async () => {
            await fs.rename(this.options.writeStream.path, this.options.writeStream.path.slice(0, -PROGRESS_FILE_EXTENSION.length));
        });
    }

    /**
     * Download/copy a file
     *
     * if `fetchStrategy` is defined as "localFile" it will copy the file, otherwise it will download it
     * By default, it will guess the strategy based on the URL
     */
    public static async createFromOptions(options: DownloadEngineOptionsNodejs) {
        DownloadEngineNodejs._validateOptions(options);
        const partsURL = "partsURL" in options ? options.partsURL : [options.url];

        options.fetchStrategy ??= DownloadEngineNodejs._guessFetchStrategy(partsURL[0]);
        const fetchStream = options.fetchStrategy === "localFile" ?
            new DownloadEngineFetchStreamLocalFile(options) :
            new DownloadEngineFetchStreamFetch(options);

        return DownloadEngineNodejs._createFromOptionsWithCustomFetch({...options, partsURL, fetchStream});
    }

    protected static async _createFromOptionsWithCustomFetch(options: DownloadEngineOptionsNodejsCustomFetch) {
        const downloadFile = await DownloadEngineNodejs._createDownloadFile(options.partsURL, options.fetchStream);
        const downloadLocation = DownloadEngineNodejs._createDownloadLocation(downloadFile, options);

        const writeStream = new DownloadEngineWriteStreamNodejs(downloadLocation + PROGRESS_FILE_EXTENSION, options);
        writeStream.fileSize = downloadFile.totalSize;

        downloadFile.downloadProgress = await writeStream.loadMetadataAfterFileWithoutRetry();

        const allOptions: DownloadEngineOptionsNodejsConstructor = {...options, writeStream};
        const engine = new DownloadEngineFile(downloadFile, allOptions);
        return new DownloadEngineNodejs(engine, allOptions);
    }

    protected static _createDownloadLocation(download: DownloadFile, options: DownloadEngineOptionsNodejs) {
        if ("savePath" in options) {
            return options.savePath;
        }

        const fileName = options.fileName || download.localFileName;
        return path.join(options.directory, fileName);
    }

    protected static _validateOptions(options: DownloadEngineOptionsNodejs) {
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
