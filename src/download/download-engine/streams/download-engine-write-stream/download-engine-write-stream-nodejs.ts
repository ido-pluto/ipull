import fs, {FileHandle} from "fs/promises";
import fsExtra from "fs-extra";
import retry from "async-retry";
import {withLock} from "lifecycle-utils";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";
import WriterIsClosedError from "./errors/writer-is-closed-error.js";

export type DownloadEngineWriteStreamOptionsNodeJS = {
    retry?: retry.Options
    mode: string;
};

const DEFAULT_OPTIONS: DownloadEngineWriteStreamOptionsNodeJS = {
    mode: "r+"
};

const NOT_ENOUGH_SPACE_ERROR_CODE = "ENOSPC";

export default class DownloadEngineWriteStreamNodejs extends BaseDownloadEngineWriteStream {
    private static _allFd = new Set<FileHandle>();
    private static _finalizationRegistry = new FinalizationRegistry(async (fd: FileHandle) => {
        if (fd.fd != null) {
            await fd.close();
        }
        DownloadEngineWriteStreamNodejs._allFd.delete(fd);
    });

    private _fd: FileHandle | null = null;
    private _fileWriteFinished = false;
    public readonly options: DownloadEngineWriteStreamOptionsNodeJS;
    public fileSize = 0;

    constructor(public path: string, public finalPath: string, options: Partial<DownloadEngineWriteStreamOptionsNodeJS> = {}) {
        super();
        this.options = {...DEFAULT_OPTIONS, ...options};
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
                DownloadEngineWriteStreamNodejs._finalizationRegistry.register(this, this._fd, this);
                return this._fd;
            }, this.options.retry);
        });
    }

    async write(cursor: number, buffer: Uint8Array) {
        let throwError: Error | false = false;

        await retry(async () => {
            try {
                return await this._writeWithoutRetry(cursor, buffer);
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

    async ftruncate(size = this.fileSize) {
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

        await this.write(this.fileSize, uint8Array);
    }

    async loadMetadataAfterFileWithoutRetry() {
        if (!await fsExtra.pathExists(this.path)) {
            return;
        }

        const fd = await this._ensureFileOpen();
        try {
            const state = await fd.stat();
            const metadataSize = state.size - this.fileSize;
            if (metadataSize <= 0) {
                return;
            }

            const metadataBuffer = Buffer.alloc(metadataSize);
            await fd.read(metadataBuffer, 0, metadataSize, this.fileSize);
            const decoder = new TextDecoder();
            const metadataString = decoder.decode(metadataBuffer);

            try {
                return JSON.parse(metadataString);
            } catch {}
        } finally {
            await this.close();
        }
    }

    private async _writeWithoutRetry(cursor: number, buffer: Uint8Array) {
        const fd = await this._ensureFileOpen();
        const {bytesWritten} = await fd.write(buffer, 0, buffer.length, cursor);
        return bytesWritten;
    }

    override async close() {
        if (!this._fd) {
            return;
        }

        if (this._fd.fd != null) {
            await this._fd.close();
        }
        DownloadEngineWriteStreamNodejs._allFd.delete(this._fd);
        DownloadEngineWriteStreamNodejs._finalizationRegistry.unregister(this);
        this._fd = null;
    }
}
