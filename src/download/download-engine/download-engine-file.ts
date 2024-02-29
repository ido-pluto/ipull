import {PromisePool, Stoppable} from "@supercharge/promise-pool";
import ProgressStatusFile, {ProgressStatus} from "./progress-status-file.js";
import {ChunkStatus, DownloadFile, SaveProgressInfo} from "./types.js";
import BaseDownloadEngineFetchStream from "./streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import BaseDownloadEngineWriteStream from "./streams/download-engine-write-stream/base-download-engine-write-stream.js";
import retry from "async-retry";
import {EventEmitter} from "eventemitter3";
import {withLock} from "lifecycle-utils";

export type DownloadEngineFileOptions = {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string;
    fetchStream: BaseDownloadEngineFetchStream,
    writeStream: BaseDownloadEngineWriteStream,
    onFinishAsync?: () => Promise<void>
    onCloseAsync?: () => Promise<void>
    onSaveProgressAsync?: (progress: SaveProgressInfo) => Promise<void>
};

export type DownloadEngineFileOptionsWithDefaults = DownloadEngineFileOptions & {
    chunkSize: number;
    parallelStreams: number;
};

export type DownloadEngineFileEvents = {
    start: () => void
    paused: () => void
    resumed: () => void
    progress: (progress: ProgressStatus) => void
    save: (progress: SaveProgressInfo) => void
    finished: () => void
    closed: () => void
    [key: string]: any
};

const DEFAULT_OPTIONS: Omit<DownloadEngineFileOptionsWithDefaults, "fetchStream" | "writeStream"> = {
    chunkSize: 1024 * 1024 * 5,
    parallelStreams: 1
};

export default class DownloadEngineFile extends EventEmitter<DownloadEngineFileEvents> {
    public readonly file: DownloadFile;
    public options: DownloadEngineFileOptionsWithDefaults;

    protected _progress: SaveProgressInfo = {
        part: 0,
        chunks: [],
        chunkSize: 0
    };

    protected _closed = false;
    protected _progressStatus: ProgressStatusFile;
    protected _activePool?: Stoppable;
    protected _activeStreamBytes: { [key: number]: number } = {};

    public constructor(file: DownloadFile, options: DownloadEngineFileOptions) {
        super();
        this.file = file;
        this._progressStatus = new ProgressStatusFile(file.totalSize, file.parts.length, file.localFileName, options.comment, options.fetchStream.transferAction);
        this.options = {...DEFAULT_OPTIONS, ...options};
        this._initProgress();
    }

    public get downloadSize() {
        return this.file.totalSize;
    }

    public get status(): ProgressStatus {
        return this._progressStatus.createStatus(this._progress.part + 1, this.transferredBytes);
    }

    protected get _activePart() {
        return this.file.parts[this._progress.part];
    }

    public get transferredBytes() {
        const activeDownloadBytes = this._progress.chunks.filter(c => c === ChunkStatus.COMPLETE).length * this._progress.chunkSize;
        const previousPartsBytes = this.file.parts.slice(0, this._progress.part)
            .reduce((acc, part) => acc + part.size, 0);
        const chunksBytes = activeDownloadBytes + previousPartsBytes;
        const streamingBytes = Object.values(this._activeStreamBytes)
            .reduce((acc, bytes) => acc + bytes, 0);

        return chunksBytes + streamingBytes;
    }

    protected _emptyChunksForPart(part: number) {
        const partInfo = this.file.parts[part];
        const chunksCount = Math.ceil(partInfo.size / this.options.chunkSize);
        return new Array(chunksCount).fill(ChunkStatus.NOT_STARTED);
    }

    private _initProgress() {
        if (this.file.downloadProgress) {
            this._progress = this.file.downloadProgress;
        } else {
            this._progress = {
                part: 0,
                chunks: this._emptyChunksForPart(0),
                chunkSize: this.options.chunkSize
            };
        }
    }

    public async download() {
        this.emit("start");
        this._progressStatus.started();
        for (let i = this._progress.part; i < this.file.parts.length; i++) {
            if (i > this._progress.part || !this._activePart.acceptRange) {
                this._progress.part = i;
                this._progress.chunkSize = this.options.chunkSize;
                this._progress.chunks = this._emptyChunksForPart(i);
            }

            this._activeStreamBytes = {};
            if (this._activePart.acceptRange && this.options.parallelStreams > 1) {
                await this._downloadPartParallelStream();
            } else {
                await this._downloadWithoutParallelStreams();
            }
        }
        await this._saveProgress();
        this._progressStatus.finished();
        this.emit("finished");
        await this.options.onFinishAsync?.();
    }

    protected async _downloadWithoutParallelStreams() {
        const startIndex = this._progress.chunks.findIndex(status => status !== ChunkStatus.COMPLETE);
        if (startIndex === -1) return;
        const startByteDownloaded = startIndex * this._progress.chunkSize;

        const fetchState = this.options.fetchStream.withSubState({
            chunkSize: this._progress.chunkSize,
            start: startByteDownloaded,
            end: this.downloadSize,
            url: this._activePart.downloadURL!,
            rangeSupport: this._activePart.acceptRange,
            onProgress: (length: number) => {
                this._activeStreamBytes[0] = length;
                this._sendProgressDownloadPart();
            }
        });

        await fetchState.fetchChunks((chunk, index) => {
            if (this._closed) return;

            const byteDownloaded = startByteDownloaded + index * this._progress.chunkSize;
            this.options.writeStream.write(byteDownloaded, chunk);
            this._progress.chunks[startIndex + index] = ChunkStatus.COMPLETE;
            this._activeStreamBytes[0] = 0;
            this._saveProgress();
        });
    }

    protected async _downloadPartParallelStream() {
        try {
            await PromisePool.withConcurrency(this.options.parallelStreams)
                .for(this._progress.chunks)
                .process(async (status, index, pool) => {
                    await this.options.fetchStream.paused;
                    this._activePool = pool;
                    if (status !== ChunkStatus.NOT_STARTED) {
                        return;
                    }
                    this._activeStreamBytes[index] = 0;
                    this._progress.chunks[index] = ChunkStatus.IN_PROGRESS;

                    const start = index * this._progress.chunkSize;
                    const end = Math.min(start + this._progress.chunkSize, this._activePart.size);
                    const buffer = await this.options.fetchStream.fetchBytes(this._activePart.downloadURL!, start, end, (length: number) => {
                        this._activeStreamBytes[index] = length;
                        this._sendProgressDownloadPart();
                    });

                    await this.options.writeStream.write(start, buffer);
                    this._progress.chunks[index] = ChunkStatus.COMPLETE;
                    delete this._activeStreamBytes[index];

                    this._saveProgress();
                });
        } finally {
            this._activePool = undefined;
        }
    }

    protected async _saveProgress() {
        this.emit("save", this._progress);
        this._sendProgressDownloadPart();
        await withLock(this, "_saveLock", async () => {
            await this.options.onSaveProgressAsync?.(this._progress);
        });
    }

    protected _sendProgressDownloadPart() {
        this.emit("progress", this.status);
    }

    public pause() {
        if (this.options.fetchStream.paused) {
            return;
        }

        this.options.fetchStream.emit("paused");
        this.emit("paused");
    }

    public resume() {
        if (!this.options.fetchStream.paused) {
            return;
        }

        this.options.fetchStream.emit("resumed");
        this.emit("resumed");
    }

    public async close() {
        if (this._closed) return;
        this._closed = true;
        this._activePool?.stop?.();
        await this.options.writeStream.close();
        await this.options.fetchStream.close();
        this.emit("closed");
        await this.options.onCloseAsync?.();
    }

    public [Symbol.dispose]() {
        return this.close();
    }
}
