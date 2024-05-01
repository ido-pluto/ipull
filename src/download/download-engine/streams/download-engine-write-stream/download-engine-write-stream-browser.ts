import retry from "async-retry";
import {DownloadFile} from "../../types.js";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";
import WriterIsClosedError from "./errors/writer-is-closed-error.js";
import WriterNotDefineError from "./errors/writer-not-define-error.js";

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
        return this.options.file?.totalSize && this._bytesWritten === this.options.file.totalSize;
    }

    public constructor(_writer?: DownloadEngineWriteStreamBrowserWriter, options: DownloadEngineWriteStreamOptionsBrowser = {}) {
        super();
        this.options = options;
        this._writer = _writer;
    }

    protected _ensureBuffer(length: number) {
        if (this._memory.length >= length) {
            return this._memory;
        }

        if (!this.options.file) {
            throw new WriterNotDefineError("Writer & file is not defined, please provide a writer or file");
        }

        const newSize = Math.max(length, this.options.file.totalSize);
        const newMemory = new Uint8Array(newSize);
        newMemory.set(this._memory);

        return this._memory = newMemory;
    }

    public write(cursor: number, buffer: Uint8Array) {
        if (this.writerClosed) {
            throw new WriterIsClosedError();
        }

        if (!this._writer) {
            this._ensureBuffer(cursor + buffer.byteLength)
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
