import fs, {FileHandle} from "fs/promises";
import {withLock} from "lifecycle-utils";
import retry from "async-retry";
import fsExtra from "fs-extra";
import BaseDownloadEngineFetchStream, {DownloadInfoResponse, FetchSubState, WriteCallback} from "./base-download-engine-fetch-stream.js";
import SmartChunkSplit from "./utils/smart-chunk-split.js";
import streamResponse from "./utils/stream-response.js";

const OPEN_MODE = "r";

export default class DownloadEngineFetchStreamLocalFile extends BaseDownloadEngineFetchStream {
    public override transferAction = "Copying";
    private _fd: FileHandle | null = null;
    private _fsPath: string | null = null;

    override withSubState(state: FetchSubState): this {
        const fetchStream = new DownloadEngineFetchStreamLocalFile(this.options);
        return this.cloneState(state, fetchStream) as this;
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

    protected override async fetchWithoutRetryChunks(callback: WriteCallback): Promise<void> {
        const file = await this._ensureFileOpen(this.state.activePart.downloadURL);

        const stream = file.createReadStream({
            start: this._startSize,
            end: this._endSize - 1,
            autoClose: true
        });

        return await streamResponse(stream, this, new SmartChunkSplit(callback, this.state), this.state.onProgress);
    }

    protected override async fetchDownloadInfoWithoutRetry(path: string): Promise<DownloadInfoResponse> {
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
