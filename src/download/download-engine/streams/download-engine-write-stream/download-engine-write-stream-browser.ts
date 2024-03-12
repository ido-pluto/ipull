import retry from "async-retry";
import {DownloadFile} from "../../types.js";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";

type DownloadEngineWriteStreamOptionsBrowser = {
    retry?: retry.Options
    file?: DownloadFile
};

export type DownloadEngineWriteStreamBrowserWriter = (cursor: number, buffer: Uint8Array, options: DownloadEngineWriteStreamOptionsBrowser) => Promise<void> | void;

export default class DownloadEngineWriteStreamBrowser extends BaseDownloadEngineWriteStream {
    protected readonly _writer?: DownloadEngineWriteStreamBrowserWriter;
    public readonly options: DownloadEngineWriteStreamOptionsBrowser = {};

    protected _memory: Uint8Array = new Uint8Array(0);
    protected _bytesWritten = 0;

    public get writerClosed() {
        return this._bytesWritten === this.options.file?.totalSize;
    }

    public constructor(_writer?: DownloadEngineWriteStreamBrowserWriter, options: DownloadEngineWriteStreamOptionsBrowser = {}) {
        super();
        this.options = options;
        this._writer = _writer;
    }

    protected _ensureBuffer() {
        if (this._memory.length > 0) {
            return this._memory;
        }

        if (!this.options.file) {
            throw new Error("Writer & file is not defined, please provide a writer or file");
        }

        return this._memory = new Uint8Array(this.options.file.totalSize);
    }

    public write(cursor: number, buffer: Uint8Array) {
        if (this.writerClosed) {
            throw new Error("Writer is closed");
        }

        if (!this._writer) {
            this._ensureBuffer()
                .set(buffer, cursor);
            this._bytesWritten += buffer.byteLength;
            return;
        }
        return this._writer(cursor, buffer, this.options);
    }

    public get result() {
        return this._memory;
    }

    public resultAsBlobURL() {
        const blob = new Blob([this._memory]);
        return URL.createObjectURL(blob);
    }

    public resultAsText() {
        return new TextDecoder().decode(this._memory);
    }
}
