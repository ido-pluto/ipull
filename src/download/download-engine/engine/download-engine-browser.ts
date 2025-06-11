import {SaveProgressInfo} from "../types.js";
import DownloadEngineFile from "../download-file/download-engine-file.js";
import DownloadEngineFetchStreamFetch from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFetchStreamXhr from "../streams/download-engine-fetch-stream/download-engine-fetch-stream-xhr.js";
import DownloadEngineWriteStreamBrowser, {DownloadEngineWriteStreamBrowserWriter} from "../streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import BaseDownloadEngine, {BaseDownloadEngineOptions, DEFAULT_BASE_DOWNLOAD_ENGINE_OPTIONS} from "./base-download-engine.js";
import BaseDownloadEngineWriteStream from "../streams/download-engine-write-stream/base-download-engine-write-stream.js";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";

export type DownloadEngineOptionsBrowser = BaseDownloadEngineOptions & {
    onWrite?: DownloadEngineWriteStreamBrowserWriter,
    progress?: SaveProgressInfo,
    fetchStrategy?: "xhr" | "fetch",
};

export type DownloadEngineOptionsCustomFetchBrowser = DownloadEngineOptionsBrowser & {
    partURLs: string[];
    fetchStream: BaseDownloadEngineFetchStream
};

export type DownloadEngineOptionsBrowserConstructor<WriteStream = DownloadEngineWriteStreamBrowser> =
    DownloadEngineOptionsCustomFetchBrowser
    & {
    writeStream: WriteStream
};


/**
 * Download engine for browser
 */
export default class DownloadEngineBrowser<WriteStream extends BaseDownloadEngineWriteStream = BaseDownloadEngineWriteStream> extends BaseDownloadEngine {
    public override readonly options: DownloadEngineOptionsBrowserConstructor<WriteStream>;

    protected constructor(engine: DownloadEngineFile, _options: DownloadEngineOptionsBrowserConstructor<WriteStream>) {
        super(engine, _options);
        this.options = _options;
    }

    public get writeStream(): Omit<WriteStream, "write" | "close"> {
        return this.options.writeStream;
    }

    /**
     * Download file
     */
    public static async createFromOptions(options: DownloadEngineOptionsBrowser) {
        options = Object.assign({}, DEFAULT_BASE_DOWNLOAD_ENGINE_OPTIONS, options);

        DownloadEngineBrowser._validateOptions(options);
        const partURLs = "partURLs" in options ? options.partURLs : [options.url];

        const fetchStream = options.fetchStrategy === "xhr" ?
            new DownloadEngineFetchStreamXhr(options) : new DownloadEngineFetchStreamFetch(options);

        return DownloadEngineBrowser._createFromOptionsWithCustomFetch({...options, partURLs, fetchStream});
    }


    protected static async _createFromOptionsWithCustomFetch(options: DownloadEngineOptionsCustomFetchBrowser) {
        const downloadFile = await DownloadEngineBrowser._createDownloadFile(options.partURLs, options.fetchStream);
        downloadFile.downloadProgress = options.progress;

        const writeStream = new DownloadEngineWriteStreamBrowser(options.onWrite, {
            ...options,
            file: downloadFile
        });

        if (options.acceptRangeIsKnown == null) {
            const doesNotAcceptRange = downloadFile.parts.find(p => !p.acceptRange);
            if (doesNotAcceptRange) {
                console.warn(`Server does not accept range requests for "${doesNotAcceptRange.downloadURL}". Meaning fast-downloads/pausing/resuming will not work.
This may be related to cors origin policy (range header is ignored in the browser). 
If you know the server accepts range requests, you can set "acceptRangeIsKnown" to true. To dismiss this warning, set "acceptRangeIsKnown" to false.`);
            }
        }

        const allOptions: DownloadEngineOptionsBrowserConstructor = {...options, writeStream};
        const engine = new DownloadEngineFile(downloadFile, allOptions);
        return new DownloadEngineBrowser(engine, allOptions);
    }

    protected static override _validateOptions(options: DownloadEngineOptionsBrowser) {
        super._validateOptions(options);
        DownloadEngineBrowser._validateURL(options);
    }
}
