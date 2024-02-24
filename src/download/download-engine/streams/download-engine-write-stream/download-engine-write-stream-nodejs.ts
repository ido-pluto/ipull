import fs, {FileHandle} from "fs/promises";
import fsExtra from "fs-extra";
import retry from "async-retry";
import {withLock} from "lifecycle-utils";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";

export type DownloadEngineWriteStreamOptionsNodeJS = {
    retry?: retry.Options
    mode: string;
};

const DEFAULT_OPTIONS: DownloadEngineWriteStreamOptionsNodeJS = {
    mode: "r+"
};

export default class DownloadEngineWriteStreamNodejs extends BaseDownloadEngineWriteStream {
    private _fd: FileHandle | null = null;
    public readonly options: DownloadEngineWriteStreamOptionsNodeJS;
    public fileSize = 0;

    constructor(public readonly path: string, options: Partial<DownloadEngineWriteStreamOptionsNodeJS> = {}) {
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
                return this._fd = await fs.open(this.path, this.options.mode);
            }, this.options.retry);
        });
    }

    async write(cursor: number, buffer: Uint8Array) {
        await retry(async () => {
            return await this._writeWithoutRetry(cursor, buffer);
        }, this.options.retry);
    }

    async ftruncate(size = this.fileSize) {
        await retry(async () => {
            const fd = await this._ensureFileOpen();
            await fd.truncate(size);
        }, this.options.retry);
    }

    async saveMedataAfterFile(data: any) {
        const jsonString = JSON.stringify(data);

        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(jsonString);

        await this.write(this.fileSize, uint8Array);
    }

    async loadMetadataAfterFileWithoutRetry() {
        const fd = await this._ensureFileOpen();
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
    }

    private async _writeWithoutRetry(cursor: number, buffer: Uint8Array) {
        const fd = await this._ensureFileOpen();
        const {bytesWritten} = await fd.write(buffer, 0, buffer.length, cursor);
        return bytesWritten;
    }

    override async close() {
        await this._fd?.close();
        this._fd = null;
    }
}
