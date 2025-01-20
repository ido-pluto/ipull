import fs, {FileHandle} from "fs/promises";
import fsExtra from "fs-extra";
import retry from "async-retry";
import {withLock} from "lifecycle-utils";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";
import WriterIsClosedError from "./errors/writer-is-closed-error.js";
import {BytesWriteDebounce} from "./utils/BytesWriteDebounce.js";

export type DownloadEngineWriteStreamOptionsNodeJS = {
    retry?: retry.Options
    mode: string;
    debounceWrite?: {
        maxTime?: number
        maxSize?: number
    }
};

const DEFAULT_OPTIONS = {
    mode: "r+",
    debounceWrite: {
        maxTime: 1000 * 5, // 5 seconds
        maxSize: 1024 * 1024 * 2 // 2 MB
    }
} satisfies DownloadEngineWriteStreamOptionsNodeJS;
const MAX_AUTO_DEBOUNCE_SIZE = 1024 * 1024 * 100; // 100 MB
const AUTO_DEBOUNCE_SIZE_PERCENT = 0.05;

const NOT_ENOUGH_SPACE_ERROR_CODE = "ENOSPC";

export default class DownloadEngineWriteStreamNodejs extends BaseDownloadEngineWriteStream {
    private _fd: FileHandle | null = null;
    private _fileWriteFinished = false;
    private _writeDebounce: BytesWriteDebounce;
    private _fileSize = 0;

    public readonly options: DownloadEngineWriteStreamOptionsNodeJS;
    public autoDebounceMaxSize = false;

    constructor(public path: string, public finalPath: string, options: Partial<DownloadEngineWriteStreamOptionsNodeJS> = {}) {
        super();

        this.autoDebounceMaxSize = !options.debounceWrite?.maxSize;
        const optionsWithDefaults = this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            debounceWrite: {
                ...DEFAULT_OPTIONS.debounceWrite,
                ...options.debounceWrite
            }
        };

        this._writeDebounce = new BytesWriteDebounce({
            ...optionsWithDefaults.debounceWrite,
            writev: (cursor, buffer) => this._writeWithoutDebounce(cursor, buffer)
        });
    }

    public get fileSize() {
        return this._fileSize;
    }

    public set fileSize(value) {
        this._fileSize = value;

        if (this.autoDebounceMaxSize) {
            this.options.debounceWrite!.maxSize = Math.max(
                Math.min(value * AUTO_DEBOUNCE_SIZE_PERCENT, MAX_AUTO_DEBOUNCE_SIZE),
                DEFAULT_OPTIONS.debounceWrite.maxSize
            );
        }
    }

    private async _ensureFileOpen() {
        return await withLock(this, "_lock", async () => {
            if (this._fd) {
                return this._fd;
            }

            return await retry(async () => {
                await fsExtra.ensureFile(this.path);
                return this._fd = await fs.open(this.path, this.options.mode);
            }, this.options.retry);
        });
    }

    async write(cursor: number, buffer: Uint8Array) {
        await this._writeDebounce.addChunk(cursor, buffer);
    }

    async _writeWithoutDebounce(cursor: number, buffers: Uint8Array[]) {
        let throwError: Error | false = false;

        await retry(async () => {
            try {
                return await this._writeWithoutRetry(cursor, buffers);
            } catch (error: any) {
                if (error?.code === NOT_ENOUGH_SPACE_ERROR_CODE) {
                    throwError = error;
                    return;
                }
                throw error;
            }
        }, this.options.retry);

        if (throwError) {
            throw throwError;
        }
    }

    async ensureBytesSynced() {
        await this._writeDebounce.writeAll();
    }

    async ftruncate(size = this._fileSize) {
        await this.ensureBytesSynced();
        this._fileWriteFinished = true;
        await retry(async () => {
            const fd = await this._ensureFileOpen();
            await fd.truncate(size);
        }, this.options.retry);
    }

    async saveMedataAfterFile(data: any) {
        if (this._fileWriteFinished) {
            throw new WriterIsClosedError();
        }

        const jsonString = JSON.stringify(data);

        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(jsonString);

        await this.write(this._fileSize, uint8Array);
    }

    async loadMetadataAfterFileWithoutRetry() {
        if (!await fsExtra.pathExists(this.path)) {
            return;
        }

        const fd = await this._ensureFileOpen();
        try {
            const state = await fd.stat();
            const metadataSize = state.size - this._fileSize;
            if (metadataSize <= 0) {
                return;
            }

            const metadataBuffer = Buffer.alloc(metadataSize);
            await fd.read(metadataBuffer, 0, metadataSize, this._fileSize);
            const decoder = new TextDecoder();
            const metadataString = decoder.decode(metadataBuffer);

            try {
                return JSON.parse(metadataString);
            } catch {}
        } finally {
            this._fd = null;
            await fd.close();
        }
    }

    private async _writeWithoutRetry(cursor: number, buffers: Uint8Array[]) {
        return await withLock(this, "lockWriteOperation", async () => {
            const fd = await this._ensureFileOpen();
            const {bytesWritten} = await fd.writev(buffers, cursor);
            return bytesWritten;
        });
    }

    override async close() {
        await this._fd?.close();
        this._fd = null;
    }
}
