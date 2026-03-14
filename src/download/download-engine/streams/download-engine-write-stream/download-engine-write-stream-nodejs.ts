import retry from "async-retry";
import fsExtra from "fs-extra";
import fs, { FileHandle } from "fs/promises";
import { withLock } from "lifecycle-utils";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";
import WriteQueue from "./utils/WriteQueue.js";

export type DownloadEngineWriteStreamOptionsNodeJS = {
    retry?: retry.Options;
    mode: string;
    /** @deprecated Use writeBufferMaxBytes instead */
    debounceWrite?: {
        maxTime?: number;
        maxSize?: number;
    };

    /** Maximum bytes to buffer before flushing to disk (default: adaptive 5% of file size, min 2MB, max 64MB) */
    writeBufferMaxBytes?: number;
};

const MAX_META_SIZE = 10485760; // 10 MB

const DEFAULT_OPTIONS = {
    mode: "r+"
} satisfies DownloadEngineWriteStreamOptionsNodeJS;

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
    private _fileSize = 0;
    private _writeQueue: WriteQueue;
    private _metadataToSave: any = null;

    public readonly options: DownloadEngineWriteStreamOptionsNodeJS;

    constructor(public path: string, public finalPath: string, options: Partial<DownloadEngineWriteStreamOptionsNodeJS> = {}) {
        super();

        this.options = {
            ...DEFAULT_OPTIONS,
            ...options
        };

        this._writeQueue = new WriteQueue({
            getFd: this._ensureFileOpen.bind(this),
            writeBufferMaxBytes: this.options.writeBufferMaxBytes || this.options.debounceWrite?.maxSize,
            flushMetadata: () => {
                if (this._metadataToSave) {
                    const metadata = this._metadataToSave;
                    this._metadataToSave = null;
                    return this._saveMetadata(metadata);
                }

                return Promise.resolve();
            }
        });
    }

    public get fileSize() {
        return this._fileSize;
    }

    public set fileSize(value) {
        this._fileSize = value;
        this._writeQueue.setFileSize(value);
    }

    private _ensureFileOpen() {
        if (this._fd) {
            return this._fd;
        }

        return withLock(this, "_lock", async () => {
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

    /**
     * Buffer a write for the given cursor position.
     * Fragments are concatenated into a single Buffer, contiguous regions merged,
     * and auto-flushed when the adaptive threshold is exceeded.
     * Returns void (synchronous queue); errors surface via ensureBytesSynced() / close().
     */
    write(cursor: number, buffers: Uint8Array[]) {
        return this._writeQueue.addWrite(cursor, buffers);
    }

    ensureBytesSynced() {
        return this._writeQueue.drain();
    }

    async ftruncate(size = this._fileSize) {
        await this.ensureBytesSynced();
        await retry(async () => {
            const fd = await this._ensureFileOpen();
            await fd.truncate(size);
        }, this.options.retry);
    }

    saveMetadataAfterFlush(data: any) {
        this._metadataToSave = data;
    }

    private async _saveMetadata(data: any) {
        const jsonString = JSON.stringify(data);
        const uint8Array = new TextEncoder().encode(jsonString);

        const fdResult = this._ensureFileOpen();
        const fd = fdResult instanceof Promise ? await fdResult : fdResult;
        await fd.write(uint8Array, 0, uint8Array.length, this._fileSize);
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
            } catch { }
        } finally {
            await this.close();
        }
    }

    override async close() {
        this._writeQueue.close();
        await this._writeQueue.drain();

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
