import ProgressStatusFile, {ProgressStatus} from "./progress-status-file.js";
import {ChunkStatus, DownloadFile, SaveProgressInfo} from "../types.js";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import BaseDownloadEngineWriteStream from "../streams/download-engine-write-stream/base-download-engine-write-stream.js";
import retry from "async-retry";
import {EventEmitter} from "eventemitter3";
import {withLock} from "lifecycle-utils";
import switchProgram, {AvailablePrograms} from "./download-programs/switch-program.js";
import BaseDownloadProgram from "./download-programs/base-download-program.js";

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
    programType?: AvailablePrograms
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
        chunkSize: 0,
        parallelStreams: 0
    };

    protected _closed = false;
    protected _progressStatus: ProgressStatusFile;
    protected _activeStreamBytes: { [key: number]: number } = {};
    protected _activeProgram?: BaseDownloadProgram;

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

    public get fileName() {
        return this.file.localFileName;
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

        return Math.min(chunksBytes + streamingBytes, this.downloadSize);
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
                chunkSize: this.options.chunkSize,
                parallelStreams: this.options.parallelStreams
            };
        }
    }

    public async download() {
        this.emit("start");
        this._progressStatus.started();
        for (let i = this._progress.part; i < this.file.parts.length; i++) {
            if (this._closed) return;
            // If we are starting a new part, we need to reset the progress
            if (i > this._progress.part || !this._activePart.acceptRange) {
                this._progress.part = i;
                this._progress.chunkSize = this.options.chunkSize;
                this._progress.parallelStreams = this.options.parallelStreams;
                this._progress.chunks = this._emptyChunksForPart(i);
            }

            // If the part does not support range, we can only download it with a single stream
            if (!this._activePart.acceptRange) {
                this._progress.parallelStreams = 1;
            }

            // Reset in progress chunks
            this._progress.chunks = this._progress.chunks.map(chunk =>
                (chunk === ChunkStatus.COMPLETE ? ChunkStatus.COMPLETE : ChunkStatus.NOT_STARTED)
            );

            // Reset active stream progress
            this._activeStreamBytes = {};
            this._activeProgram = switchProgram(
                this._progress,
                this._downloadSlice.bind(this),
                this.options.fetchStream.programType || this.options.programType
            );
            await this._activeProgram.download();
        }
        if (this._closed) return;

        this._progressStatus.finished();
        await this._saveProgress();
        this.emit("finished");
        await this.options.onFinishAsync?.();
    }

    protected _downloadSlice(startChunk: number, endChunk: number) {
        const fetchState = this.options.fetchStream.withSubState({
            chunkSize: this._progress.chunkSize,
            startChunk,
            endChunk,
            totalSize: this.downloadSize,
            url: this._activePart.downloadURL!,
            rangeSupport: this._activePart.acceptRange,
            onProgress: (length: number) => {
                this._activeStreamBytes[startChunk] = length;
                this._sendProgressDownloadPart();
            }
        });

        this._progress.chunks[startChunk] = ChunkStatus.IN_PROGRESS;
        return (async () => {
            const allWrites: (Promise<any> | void)[] = [];

            await fetchState.fetchChunks((chunks, writePosition, index) => {
                if (this._closed || this._progress.chunks[index] != ChunkStatus.IN_PROGRESS) {
                    return;
                }

                for (const chunk of chunks) {
                    const writePromise = this.options.writeStream.write(writePosition, chunk);
                    writePosition += chunk.length;
                    if (writePromise) {
                        allWrites.push(writePromise);
                        writePromise?.then(() => {
                            allWrites.splice(allWrites.indexOf(writePromise), 1);
                        });
                    }
                }

                this._progress.chunks[index] = ChunkStatus.COMPLETE;
                delete this._activeStreamBytes[startChunk];
                void this._saveProgress();

                const nextChunk = this._progress.chunks[index + 1];
                const shouldReadNext = endChunk - index > 1; // grater than 1, meaning there is a next chunk

                if (shouldReadNext) {
                    if (nextChunk == null || nextChunk != ChunkStatus.NOT_STARTED) {
                        return fetchState.close();
                    }
                    this._progress.chunks[index + 1] = ChunkStatus.IN_PROGRESS;
                }
            });
            delete this._activeStreamBytes[startChunk];
            await Promise.all(allWrites);
        })();
    }

    protected _saveProgress() {
        this.emit("save", this._progress);
        this._sendProgressDownloadPart();
        return withLock(this, "_saveLock", async () => {
            await this.options.onSaveProgressAsync?.(this._progress);
        });
    }

    protected _sendProgressDownloadPart() {
        if (this._closed) return;
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
        this._activeProgram?.abort();
        await this.options.onCloseAsync?.();
        await this.options.writeStream.close();
        await this.options.fetchStream.close();
        this.emit("closed");
    }

    public [Symbol.dispose]() {
        return this.close();
    }
}
