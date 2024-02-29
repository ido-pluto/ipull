import fs, {FileHandle} from "fs/promises";
import {withLock} from "lifecycle-utils";
import retry from "async-retry";
import fsExtra from "fs-extra";
import BaseDownloadEngineFetchStream, {FetchSubState} from "./base-download-engine-fetch-stream.js";
import {promiseWithResolvers} from "./utils/retry-async-statement.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";

const OPEN_MODE = "r";

export default class DownloadEngineFetchStreamLocalFile extends BaseDownloadEngineFetchStream {
    public override transferAction = "Copying";
    private _fd: FileHandle | null = null;
    private _fsPath: string | null = null;

    override withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamLocalFile(this.options);
        fetchStream.state = state;

        return fetchStream as this;
    }

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

    protected override async fetchWithoutRetryChunks(callback: (data: Uint8Array, index: number) => void) {
        const file = await this._ensureFileOpen(this.state.url);
        const {promise, resolve, reject} = promiseWithResolvers();

        const smartSplit = new SmartChunkSplit(callback, this.state);
        const stream = file.createReadStream({
            start: this.state.start,
            end: this.state.end,
            autoClose: true
        });

        stream.on("data", (chunk) => {
            smartSplit.addChunk(new Uint8Array(chunk as Buffer));
            this.state.onProgress?.(smartSplit.leftOverLength);
        });

        stream.on("close", () => {
            smartSplit.sendLeftovers();
            resolve();
        });

        stream.on("error", (error) => {
            reject(error);
        });

        const pause = stream.pause.bind(stream);
        const resume = stream.resume.bind(stream);
        const close = stream.destroy.bind(stream);

        this.on("paused", pause);
        this.on("resumed", resume);
        this.on("aborted", close);

        try {
            await promise;
        } finally {
            this.off("paused", pause);
            this.off("resumed", resume);
            this.off("aborted", close);
            stream.destroy();
        }
    }

    protected override async fetchBytesWithoutRetry(path: string, start: number, end: number) {
        const file = await this._ensureFileOpen(path);
        const buffer = Buffer.alloc(end - start);
        await file.read(buffer, 0, buffer.byteLength, start);
        return buffer;
    }

    protected override async fetchDownloadInfoWithoutRetry(path: string): Promise<{ length: number; acceptRange: boolean }> {
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
        super.close();
        this._fd?.close();
        this._fd = null;
    }
}
