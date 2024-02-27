import fs, {FileHandle} from "fs/promises";
import {withLock} from "lifecycle-utils";
import retry from "async-retry";
import fsExtra from "fs-extra";
import BaseDownloadEngineFetchStream from "./base-download-engine-fetch-stream.js";

const OPEN_MODE = "r";

export default class DownloadEngineFetchStreamLocalFile extends BaseDownloadEngineFetchStream {
    private _fd: FileHandle | null = null;
    private _fsPath: string | null = null;

    private async _ensureFileOpen(path: string) {
        return await withLock(this, "_lock", async () => {
            if (this._fd && this._fsPath === path) {
                return this._fd;
            }

            this._fd?.close();
            return await retry(async () => {
                await fsExtra.ensureFile(path);
                return this._fd = await fs.open(path, OPEN_MODE);
            }, this.options.retry);
        });
    }

    protected async fetchBytesWithoutRetry(path: string, start: number, end: number) {
        const file = await this._ensureFileOpen(path);
        const buffer = Buffer.alloc(end - start);
        await file.read(buffer, 0, buffer.byteLength, start);
        return buffer;
    }

    protected async fetchDownloadInfoWithoutRetry(path: string): Promise<{ length: number; acceptRange: boolean }> {
        const stat = await fs.stat(path);
        if (!stat.isFile()) {
            throw new Error("Path is a directory");
        }
        return {
            length: stat.size,
            acceptRange: true
        };
    }

    override close() {
        this._fd?.close();
        this._fd = null;
    }
}
