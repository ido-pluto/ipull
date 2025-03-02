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
import {uid} from "uid";
import {DownloaderProgramManager} from "./downloaderProgramManager.js";

export type DownloadEngineFileOptions = {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string
    fetchStream: BaseDownloadEngineFetchStream,
    writeStream: BaseDownloadEngineWriteStream,
    onFinishAsync?: () => Promise<void>
    onStartedAsync?: () => Promise<void>
    onCloseAsync?: () => Promise<void>
    onPausedAsync?: () => Promise<void>
    onSaveProgressAsync?: (progress: SaveProgressInfo) => Promise<void>
    programType?: AvailablePrograms
    autoIncreaseParallelStreams?: boolean

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

const DEFAULT_CHUNKS_SIZE_FOR_CHUNKS_PROGRAM = 1024 * 1024 * 5; // 5MB
const DEFAULT_CHUNKS_SIZE_FOR_STREAM_PROGRAM = 1024 * 1024; // 1MB

const DEFAULT_OPTIONS: Omit<DownloadEngineFileOptionsWithDefaults, "fetchStream" | "writeStream"> = {
    chunkSize: 0,
    parallelStreams: 3,
    autoIncreaseParallelStreams: true
};

export default class DownloadEngineFile extends EventEmitter<DownloadEngineFileEvents> {
    public readonly file: DownloadFile;
    public options: DownloadEngineFileOptionsWithDefaults;

    protected _progress: SaveProgressInfo = {
        downloadId: "",
        part: 0,
        chunks: [],
        chunkSize: 0,
        parallelStreams: 0
    };

    protected _closed = false;
    protected _progressStatus: ProgressStatusFile;
    protected _activeStreamContext: {
        [key: number]: {
            streamBytes: number,
            retryingAttempts: number
            isRetrying?: boolean,
            isStreamNotResponding?: boolean
        }
    } = {};

    protected _activeProgram?: BaseDownloadProgram;
    protected _downloadStatus = DownloadStatus.NotStarted;
    private _latestProgressDate = 0;

    public constructor(file: DownloadFile, options: DownloadEngineFileOptions) {
        super();
        this.file = file;
        this.options = {...DEFAULT_OPTIONS, ...options};
        this._progressStatus = new ProgressStatusFile(file.parts.length, file.localFileName, options.fetchStream.transferAction, this._createProgressFlags());
        this._setDefaultByOptions();
        this._initProgress();

    }

    private _setDefaultByOptions() {
        if (this.options.chunkSize === 0) {
            switch (this._programType) {
                case "chunks":
                    this.options.chunkSize = DEFAULT_CHUNKS_SIZE_FOR_CHUNKS_PROGRAM;
                    break;
                case "stream":
                default:
                    this.options.chunkSize = DEFAULT_CHUNKS_SIZE_FOR_STREAM_PROGRAM;
                    break;
            }
        }
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
        const thisStatus = this._progressStatus.createStatus(this._progress.part + 1, this.transferredBytes, this.downloadSize, this._downloadStatus, this.options.comment);
        const streamContexts = Object.values(this._activeStreamContext);

        thisStatus.retrying = streamContexts.some(c => c.isRetrying);
        thisStatus.retryingTotalAttempts = Math.max(...streamContexts.map(x => x.retryingAttempts));
        thisStatus.streamsNotResponding = streamContexts.reduce((acc, cur) => acc + (cur.isStreamNotResponding ? 1 : 0), 0);

        return thisStatus;
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

        const streamingBytes = Object.values(this._activeStreamContext)
            .reduce((acc, cur) => acc + cur.streamBytes, 0);

        const streamBytes = this._activeDownloadedChunkSize + streamingBytes;
        const streamBytesMin = Math.min(streamBytes, this._activePart.size || streamBytes);

        const allBytes = streamBytesMin + this._downloadedPartsSize;
        return Math.min(allBytes, this.downloadSize || allBytes);
    }

    protected get _programType() {
        if (this.options.programType && this.options.fetchStream.availablePrograms.includes(this.options.programType)) {
            return this.options.programType;
        }
        return this.options.fetchStream.defaultProgramType;
    }

    protected _emptyChunksForPart(part: number) {
        const partInfo = this.file.parts[part];
        if (partInfo.size === 0) {
            return [ChunkStatus.NOT_STARTED];
        }

        const chunksCount = Math.ceil(partInfo.size / this.options.chunkSize);
        return new Array(chunksCount).fill(ChunkStatus.NOT_STARTED);
    }

    private _initEventReloadStatus() {
        if (this._progress.part === this.file.parts.length - 1 && this._progress.chunks.every(c => c === ChunkStatus.COMPLETE)) {
            this._downloadStatus = DownloadStatus.Finished;
        }
    }

    private _initProgress() {
        if (this.options.skipExisting) {
            this._progress.part = this.file.parts.length - 1;
            this._downloadStatus = DownloadStatus.Finished;
            this.options.comment = pushComment("Skipping existing", this.options.comment);
        } else if (this.file.downloadProgress) {
            this._progress = this.file.downloadProgress;
            this._progress.parallelStreams = this.options.parallelStreams;
            this._initEventReloadStatus();
        } else {
            this._progress = {
                part: 0,
                downloadId: uid(),
                chunks: this._emptyChunksForPart(0),
                chunkSize: this.options.chunkSize,
                parallelStreams: this.options.parallelStreams
            };
            this._progressStatus.downloadId = this._progress.downloadId;
        }
    }

    public async download() {
        if (this._downloadStatus === DownloadStatus.NotStarted) {
            this._downloadStatus = DownloadStatus.Active;
        }

        this._progressStatus.started();
        this.emit("start");
        await this.options.onStartedAsync?.();

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
            this._activeStreamContext = {};

            if (this._activePart.acceptRange) {
                this._activeProgram = switchProgram(
                    this._progress,
                    this._downloadSlice.bind(this),
                    this._programType
                );

                let manager: DownloaderProgramManager | null = null;
                if (this.options.autoIncreaseParallelStreams && this.options.fetchStream.supportDynamicStreamLength) {
                    manager = new DownloaderProgramManager(this._activeProgram, this);
                }

                try {
                    await this._activeProgram.download();
                } finally {
                    manager?.close();
                }
            } else {
                const chunksToRead = this._activePart.size > 0 ? this._progress.chunks.length : Infinity;
                await this._downloadSlice(0, chunksToRead);
            }
        }

        // All parts are downloaded, we can clear the progress
        this._activeStreamContext = {};
        this._latestProgressDate = 0;

        if (this._closed) return;

        this._progressStatus.finished();
        this._downloadStatus = DownloadStatus.Finished;
        this._sendProgressDownloadPart();
        this.emit("finished");
        await this.options.onFinishAsync?.();
    }

    protected async _downloadSlice(startChunk: number, endChunk: number) {
        const getContext = () => this._activeStreamContext[startChunk] ??= {streamBytes: 0, retryingAttempts: 0};

        const fetchState = this.options.fetchStream.withSubState({
            chunkSize: this._progress.chunkSize,
            startChunk,
            endChunk,
            totalSize: this._activePart.size,
            url: this._activePart.downloadURL!,
            rangeSupport: this._activePart.acceptRange,
            onProgress: (length: number) => {
                getContext().streamBytes = length;
                this._sendProgressDownloadPart();
            }
        });

        fetchState.addListener("retryingOn", () => {
            const context = getContext();
            context.isRetrying = true;
            context.retryingAttempts++;
            this._sendProgressDownloadPart();
        });

        fetchState.addListener("retryingOff", () => {
            getContext().isRetrying = false;
        });

        fetchState.addListener("streamNotRespondingOn", () => {
            getContext().isStreamNotResponding = true;
            this._sendProgressDownloadPart();
        });

        fetchState.addListener("streamNotRespondingOff", () => {
            getContext().isStreamNotResponding = false;
        });

        const downloadedPartsSize = this._downloadedPartsSize;
        this._progress.chunks[startChunk] = ChunkStatus.IN_PROGRESS;
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
            lastChunkSize = chunks.reduce((last, current) => last + current.length, 0);
            getContext().streamBytes = 0;
            void this._saveProgress();

            const nextChunk = this._progress.chunks[index + 1];
            const shouldReadNext = fetchState.state.endChunk - index > 1; // grater than 1, meaning there is a next chunk

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

        delete this._activeStreamContext[startChunk];
        await Promise.all(allWrites);
    }

    protected _saveProgress() {
        const thisProgress = this._latestProgressDate = Date.now();
        this._sendProgressDownloadPart();

        if (!this._activePart.acceptRange)
            return;

        this.emit("save", this._progress);
        return withLock(this, "_saveLock", async () => {
            if (thisProgress === this._latestProgressDate && !this._closed && this._downloadStatus !== DownloadStatus.Finished) {
                await this.options.onSaveProgressAsync?.(this._progress);
            }
        });
    }

    protected _sendProgressDownloadPart() {
        if (this._closed) return;
        this.emit("progress", this.status);
    }

    public async pause() {
        if (this.options.fetchStream.paused) {
            return;
        }

        this._downloadStatus = DownloadStatus.Paused;
        this.options.fetchStream.emit("paused");
        await this.options.onPausedAsync?.();
        this._sendProgressDownloadPart();
    }

    public resume() {
        if (!this.options.fetchStream.paused) {
            return;
        }

        this._downloadStatus = DownloadStatus.Active;
        this.options.fetchStream.emit("resumed");
        this.emit("resumed");
        this._sendProgressDownloadPart();
    }

    public async close() {
        if (this._closed) return;
        if (this._downloadStatus !== DownloadStatus.Finished) {
            this._progressStatus.finished();
            this._downloadStatus = DownloadStatus.Cancelled;
            this._sendProgressDownloadPart();
        }
        this._closed = true;
        this._activeProgram?.abort();
        await this.options.onCloseAsync?.();
        await this.options.writeStream.close();
        await this.options.fetchStream.close();
        this.emit("closed");
    }

    public finished(comment?: string) {
        if (comment) {
            this.options.comment = pushComment(comment, this.options.comment);
        }
        this._downloadStatus = DownloadStatus.Finished;
    }

    public [Symbol.dispose]() {
        return this.close();
    }
}
