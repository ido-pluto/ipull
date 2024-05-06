import ProgressStatusFile, {DownloadFlags, DownloadStatus, ProgressStatus} from "./progress-status-file.js";
import {ChunkStatus, DownloadFile, SaveProgressInfo} from "../types.js";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import BaseDownloadEngineWriteStream from "../streams/download-engine-write-stream/base-download-engine-write-stream.js";
import retry from "async-retry";
import {EventEmitter} from "eventemitter3";
import {withLock} from "lifecycle-utils";
import switchProgram, {AvailablePrograms} from "./download-programs/switch-program.js";
import BaseDownloadProgram from "./download-programs/base-download-program.js";
import {pushComment} from "./utils/push-comment.js";

export type DownloadEngineFileOptions = {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string
    fetchStream: BaseDownloadEngineFetchStream,
    writeStream: BaseDownloadEngineWriteStream,
    onFinishAsync?: () => Promise<void>
    onCloseAsync?: () => Promise<void>
    onSaveProgressAsync?: (progress: SaveProgressInfo) => Promise<void>
    programType?: AvailablePrograms

    /** @internal */
    skipExisting?: boolean;
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
    protected _downloadStatus = DownloadStatus.Active;
    private _latestProgressDate = 0;

    public constructor(file: DownloadFile, options: DownloadEngineFileOptions) {
        super();
        this.file = file;
        this.options = {...DEFAULT_OPTIONS, ...options};
        this._progressStatus = new ProgressStatusFile(file.parts.length, file.localFileName, options.fetchStream.transferAction, this._createProgressFlags());
        this._initProgress();
    }

    private _createProgressFlags() {
        const flags: DownloadFlags[] = [];

        if (this.options.skipExisting) {
            flags.push(DownloadFlags.Existing);
        }

        return flags;
    }

    public get downloadSize() {
        return this.file.parts.reduce((acc, part) => acc + part.size, 0);
    }

    public get fileName() {
        return this.file.localFileName;
    }

    public get status(): ProgressStatus {
        return this._progressStatus.createStatus(this._progress.part + 1, this.transferredBytes, this.downloadSize, this._downloadStatus, this.options.comment);
    }

    protected get _activePart() {
        return this.file.parts[this._progress.part];
    }

    private get _downloadedPartsSize() {
        return this.file.parts.slice(0, this._progress.part)
            .reduce((acc, part) => acc + part.size, 0);
    }

    private get _activeDownloadedChunkSize() {
        return this._progress.chunks.filter(c => c === ChunkStatus.COMPLETE).length * this._progress.chunkSize;
    }

    public get transferredBytes() {
        if (this._downloadStatus === DownloadStatus.Finished) {
            return this.downloadSize;
        }

        const streamingBytes = Object.values(this._activeStreamBytes)
            .reduce((acc, bytes) => acc + bytes, 0);

        const streamBytes = this._activeDownloadedChunkSize + streamingBytes;
        const streamBytesMin = Math.min(streamBytes, this._activePart.size || streamBytes);

        const allBytes = streamBytesMin + this._downloadedPartsSize;
        return Math.min(allBytes, this.downloadSize || allBytes);
    }

    protected _emptyChunksForPart(part: number) {
        const partInfo = this.file.parts[part];
        if (!partInfo.acceptRange) {
            return [ChunkStatus.NOT_STARTED];
        }

        const chunksCount = Math.ceil(partInfo.size / this.options.chunkSize);
        return new Array(chunksCount).fill(ChunkStatus.NOT_STARTED);
    }

    private _initProgress() {
        if (this.options.skipExisting) {
            this._progress.part = this.file.parts.length - 1;
            this._downloadStatus = DownloadStatus.Finished;
            this.options.comment = pushComment("Skipping existing", this.options.comment);
        } else if (this.file.downloadProgress) {
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
        this._progressStatus.started();
        this.emit("start");

        for (let i = this._progress.part; i < this.file.parts.length && this._downloadStatus !== DownloadStatus.Finished; i++) {
            if (this._closed) return;
            // If we are starting a new part, we need to reset the progress
            if (i > this._progress.part || !this._activePart.acceptRange) {
                this._progress.part = i;
                this._progress.chunkSize = this.options.chunkSize;
                this._progress.parallelStreams = this.options.parallelStreams;
                this._progress.chunks = this._emptyChunksForPart(i);
            }

            // Reset in progress chunks
            this._progress.chunks = this._progress.chunks.map(chunk =>
                (chunk === ChunkStatus.COMPLETE ? ChunkStatus.COMPLETE : ChunkStatus.NOT_STARTED)
            );

            // Reset active stream progress
            this._activeStreamBytes = {};

            if (this._activePart.acceptRange) {
                this._activeProgram = switchProgram(
                    this._progress,
                    this._downloadSlice.bind(this),
                    this.options.fetchStream.programType || this.options.programType
                );
                await this._activeProgram.download();
            } else {
                await this._downloadSlice(0, Infinity);
            }
        }

        // All parts are downloaded, we can clear the progress
        this._activeStreamBytes = {};
        this._latestProgressDate = 0;

        if (this._closed) return;

        this._progressStatus.finished();
        this._downloadStatus = DownloadStatus.Finished;
        this.emit("finished");
        await this.options.onFinishAsync?.();
    }

    protected _downloadSlice(startChunk: number, endChunk: number) {
        const fetchState = this.options.fetchStream.withSubState({
            chunkSize: this._progress.chunkSize,
            startChunk,
            endChunk,
            totalSize: this._activePart.size,
            url: this._activePart.downloadURL!,
            rangeSupport: this._activePart.acceptRange,
            onProgress: (length: number) => {
                this._activeStreamBytes[startChunk] = length;
                this._sendProgressDownloadPart();
            }
        });


        const downloadedPartsSize = this._downloadedPartsSize;
        this._progress.chunks[startChunk] = ChunkStatus.IN_PROGRESS;
        return (async () => {
            const allWrites = new Set<Promise<any>>();

            let lastChunkSize = 0;
            await fetchState.fetchChunks((chunks, writePosition, index) => {
                if (this._closed || this._progress.chunks[index] != ChunkStatus.IN_PROGRESS) {
                    return;
                }

                for (const chunk of chunks) {
                    const writePromise = this.options.writeStream.write(downloadedPartsSize + writePosition, chunk);
                    writePosition += chunk.length;
                    if (writePromise) {
                        allWrites.add(writePromise);
                        writePromise.then(() => {
                            allWrites.delete(writePromise);
                        });
                    }
                }

                // if content length is 0, we do not know how many chunks we should have
                if (this._activePart.size === 0) {
                    this._progress.chunks.push(ChunkStatus.NOT_STARTED);
                }

                this._progress.chunks[index] = ChunkStatus.COMPLETE;
                lastChunkSize = this._activeStreamBytes[startChunk];
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

            // On dynamic content length, we need to adjust the last chunk size
            if (this._activePart.size === 0) {
                this._activePart.size = this._activeDownloadedChunkSize - this.options.chunkSize + lastChunkSize;
                this._progress.chunks = this._progress.chunks.filter(c => c === ChunkStatus.COMPLETE);
            }

            delete this._activeStreamBytes[startChunk];
            await Promise.all(allWrites);
        })();
    }

    protected _saveProgress() {
        const thisProgress = this._latestProgressDate = Date.now();
        this._sendProgressDownloadPart();

        if (!this._activePart.acceptRange)
            return;

        this.emit("save", this._progress);
        return withLock(this, "_saveLock", async () => {
            if (thisProgress === this._latestProgressDate) {
                await this.options.onSaveProgressAsync?.(this._progress);
            }
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

        this._downloadStatus = DownloadStatus.Paused;
        this.options.fetchStream.emit("paused");
        this.emit("paused");
        this._sendProgressDownloadPart();
    }

    public resume() {
        if (!this.options.fetchStream.paused) {
            return;
        }

        this._downloadStatus = DownloadStatus.Active;
        this.options.fetchStream.emit("resumed");
        this.emit("resumed");
    }

    public async close() {
        if (this._closed) return;
        if (this._downloadStatus !== DownloadStatus.Finished) {
            this._downloadStatus = DownloadStatus.Cancelled;
        }
        this._sendProgressDownloadPart();
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
