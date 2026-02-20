import fs, {FileHandle} from "fs/promises";
import fsExtra from "fs-extra";
import retry from "async-retry";
import {withLock} from "lifecycle-utils";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";
import WriterIsClosedError from "./errors/writer-is-closed-error.js";

export type DownloadEngineWriteStreamOptionsNodeJS = {
    retry?: retry.Options
    mode: string;
    /**@deprecated This functionality had been remove duo to performance issues **/
    debounceWrite?: {
        maxTime?: number
        maxSize?: number
    }
};

const DEFAULT_OPTIONS = {
    mode: "r+"
} satisfies DownloadEngineWriteStreamOptionsNodeJS;
const MAX_META_SIZE = 10485760; // 10 MB

const NOT_ENOUGH_SPACE_ERROR_CODE = "ENOSPC";

export default class DownloadEngineWriteStreamNodejs extends BaseDownloadEngineWriteStream {
    private static _allFd = new Set<FileHandle>();
    private static _finalizationRegistry = new FinalizationRegistry(async (fd: FileHandle) => {
        if (fd.fd != null) {
            await fd.close();
        }
        DownloadEngineWriteStreamNodejs._allFd.delete(fd);
    });

    private _finalToken = {};
    private _fd: FileHandle | null = null;
    private _fileWriteFinished = false;
    private _fileSize = 0;
    private _lastWritePromise: Promise<any> | null = null;

    public readonly options: DownloadEngineWriteStreamOptionsNodeJS;
    public autoDebounceMaxSize = false;

    constructor(public path: string, public finalPath: string, options: Partial<DownloadEngineWriteStreamOptionsNodeJS> = {}) {
        super();

        this.autoDebounceMaxSize = !options.debounceWrite?.maxSize;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options
        };
    }

    public get fileSize() {
        return this._fileSize;
    }

    public set fileSize(value) {
        this._fileSize = value;
    }

    private async _ensureFileOpen() {
        return await withLock(this, "_lock", async () => {
            if (this._fd) {
                return this._fd;
            }

            return await retry(async () => {
                await fsExtra.ensureFile(this.path);
                this._fd = await fs.open(this.path, this.options.mode);
                DownloadEngineWriteStreamNodejs._allFd.add(this._fd);
                DownloadEngineWriteStreamNodejs._finalizationRegistry.register(this, this._fd, this._finalToken);
                return this._fd;
            }, this.options.retry);
        });
    }

    async write(cursor: number, buffers: Uint8Array[]) {
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
        if (this._lastWritePromise) {
            await this._lastWritePromise;
        }
    }

    async ftruncate(size = this._fileSize) {
        await this.ensureBytesSynced();
        this._fileWriteFinished = true;
        await retry(async () => {
            const fd = await this._ensureFileOpen();
            await fd.truncate(size);
        }, this.options.retry);
    }

    async saveMetadataAfterFile(data: any) {
        if (this._fileWriteFinished) {
            throw new WriterIsClosedError();
        }

        const jsonString = JSON.stringify(data);

        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(jsonString);

        await this.write(this._fileSize, [uint8Array]);
    }

    async loadMetadataAfterFileWithoutRetry() {
        if (!await fsExtra.pathExists(this.path)) {
            return;
        }

        const fd = await this._ensureFileOpen();
        try {
            const state = await fd.stat();
            const metadataSize = state.size - this._fileSize;
            if (metadataSize <= 0 || metadataSize >= MAX_META_SIZE) {
                if (this._fileSize > 0 && state.size > this._fileSize) {
                    await this.ftruncate();
                }
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
            await this.close();
        }
    }

    private async _writeWithoutRetry(cursor: number, buffers: Uint8Array[]) {
        return await (this._lastWritePromise = withLock(this, "lockWriteOperation", async () => {
            const fd = await this._ensureFileOpen();
            const {bytesWritten} = await fd.writev(buffers, cursor);
            return bytesWritten;
        }));
    }

    override async close() {
        if (!this._fd) {
            return;
        }

        if (this._fd.fd != null) {
            await this._fd.close();
        }
        DownloadEngineWriteStreamNodejs._allFd.delete(this._fd);
        DownloadEngineWriteStreamNodejs._finalizationRegistry.unregister(this._finalToken);
        this._fd = null;
    }
}
