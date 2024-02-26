import {PromisePool, Stoppable} from "@supercharge/promise-pool";
import ProgressStatusFile from "./progress-status-file.js";
import {ChunkStatus, DownloadEngineFileOptions, DownloadFile, DownloadProgressInfo} from "./types.js";
import Emittery from "emittery";

export type DownloadEngineFileOptionsWithDefaults = DownloadEngineFileOptions &
    {
        chunkSize: number;
        parallelStreams: number;
    };

export interface DownloadEngineFileEvents {
    start: undefined;
    paused: undefined;
    resumed: undefined;
    progress: ProgressStatusFile;
    save: DownloadProgressInfo;
    finished: undefined;
    closed: undefined;

    [key: string]: any;
}

const DEFAULT_OPTIONS: Omit<DownloadEngineFileOptionsWithDefaults, "fetchStream" | "writeStream"> = {
    chunkSize: 1024 * 1024 * 5,
    parallelStreams: 4
};

export default class DownloadEngineFile extends Emittery<DownloadEngineFileEvents> {
    public readonly file: DownloadFile;

    protected _progress: DownloadProgressInfo = {
        part: 0,
        chunks: [],
        chunkSize: 0
    };

    protected _closed = false;
    protected _progressStatus: ProgressStatusFile;
    protected _options: DownloadEngineFileOptionsWithDefaults;
    protected _activePool?: Stoppable;
    protected _activeStreamBytes: { [key: number]: number } = {};

    // pause/abort state
    protected _paused = false;
    protected _pausedPromise?: Promise<void>;
    protected _pausedResolve?: () => void;
    protected _pausedReject?: (error: Error) => void;

    get fileSize() {
        return this.file.totalSize;
    }

    protected get _activePart() {
        return this.file.parts[this._progress.part];
    }

    get bytesDownloaded() {
        const activeDownloadBytes = this._progress.chunks.filter(c => c === ChunkStatus.COMPLETE).length * this._progress.chunkSize;
        const previousPartsBytes = this.file.parts.slice(0, this._progress.part)
            .reduce((acc, part) => acc + part.size, 0);
        const chunksBytes = activeDownloadBytes + previousPartsBytes;
        const streamingBytes = Object.values(this._activeStreamBytes)
            .reduce((acc, bytes) => acc + bytes, 0);

        return chunksBytes + streamingBytes;
    }

    constructor(file: DownloadFile, options: DownloadEngineFileOptions) {
        super();
        this.file = file;
        this._progressStatus = new ProgressStatusFile(file.totalSize, file.parts.length, file.localFileName, options.comment);
        this._options = {...DEFAULT_OPTIONS, ...options};
        this._initProgress();
    }

    protected _emptyChunksForPart(part: number) {
        const partInfo = this.file.parts[part];
        const chunksCount = Math.ceil(partInfo.size / this._options.chunkSize);
        return new Array(chunksCount).fill(ChunkStatus.NOT_STARTED);
    }

    private _initProgress() {
        if (this.file.downloadProgress) {
            this._progress = this.file.downloadProgress;
        } else {
            this._progress = {
                part: 0,
                chunks: this._emptyChunksForPart(0),
                chunkSize: this._options.chunkSize
            };
        }
    }

    async download() {
        await this.emit("start");
        for (let i = this._progress.part; i < this.file.parts.length; i++) {
            if (i > this._progress.part) {
                this._progress.part = i;
                this._progress.chunkSize = this._options.chunkSize;
                this._progress.chunks = this._emptyChunksForPart(i);
            }

            if (this._activePart.acceptRange === false) {
                this._progress.chunkSize = this._activePart.size;
                this._progress.chunks = [ChunkStatus.NOT_STARTED];
            }

            this._activeStreamBytes = {};
            await this._downloadPart();
        }
        await this.emit("finished");
    }

    protected async _downloadPart() {
        try {
            await PromisePool.withConcurrency(this._options.parallelStreams)
                .for(this._progress.chunks)
                .process(async (status, index, pool) => {
                    await this._pausedPromise;
                    this._activePool = pool;
                    if (status !== ChunkStatus.NOT_STARTED) {
                        return;
                    }
                    this._activeStreamBytes[index] = 0;
                    this._progress.chunks[index] = ChunkStatus.IN_PROGRESS;

                    const start = index * this._progress.chunkSize;
                    const end = Math.min(start + this._progress.chunkSize, this._activePart.size);
                    const buffer = await this._options.fetchStream.fetchBytes(this._activePart.downloadURL!, start, end, (length: number) => {
                        this._activeStreamBytes[index] = length;
                        this._sendProgressDownloadPart();
                    });

                    await this._options.writeStream.write(start, buffer);
                    this._progress.chunks[index] = ChunkStatus.COMPLETE;
                    delete this._activeStreamBytes[index];

                    await this._saveProgress();
                });
        } finally {
            this._activePool = undefined;
        }
    }

    protected async _saveProgress() {
        await this.emit("save", this._progress);
        this._sendProgressDownloadPart();
    }

    protected _sendProgressDownloadPart() {
        const progress = this._progressStatus.createStatus(this._progress.part + 1, this.bytesDownloaded);
        this.emit("progress", progress);
    }

    pause() {
        if (this._paused) {
            return;
        }

        this._paused = true;
        this._pausedPromise = new Promise((resolve, reject) => {
            this._pausedResolve = resolve;
            this._pausedReject = reject;
        });
        this.emit("paused");
    }

    resume() {
        if (!this._paused) {
            return;
        }

        this._paused = false;
        this._pausedResolve?.();
        this.emit("resumed");
    }

    async close() {
        if (this._closed) return;
        this._closed = true;
        if (this._activePool) {
            this._activePool.stop();
        }
        this.pause();
        await this._options.writeStream.close();
        await this._options.fetchStream.close();
        await this.emit("closed");
    }

    [Symbol.dispose]() {
        return this.close();
    }
}
