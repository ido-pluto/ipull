import {ChunkStatus, SaveProgressInfo} from "../../types.js";
import {promiseWithResolvers} from "../../utils/promiseWithResolvers.js";

export type ProgramSlice = {
    start: number,
    end: number
};

export type DownloadSlice = (startChunk: number, endChunk: number) => Promise<void>;

export default abstract class BaseDownloadProgram {
    protected savedProgress: SaveProgressInfo;
    protected readonly _downloadSlice: DownloadSlice;
    protected _aborted = false;
    protected _parallelStreams: number;
    protected _reload?: () => void;
    protected _activeDownloads: Promise<any>[] = [];

    protected constructor(_savedProgress: SaveProgressInfo, _downloadSlice: DownloadSlice) {
        this._downloadSlice = _downloadSlice;
        this.savedProgress = _savedProgress;
        this._parallelStreams = this.savedProgress.parallelStreams;
    }

    get parallelStreams() {
        return this._parallelStreams;
    }

    set parallelStreams(value: number) {
        const needReload = value > this._parallelStreams;
        this._parallelStreams = value;
        if (needReload) {
            this._reload?.();
        }
    }

    incParallelStreams() {
        this.parallelStreams = this._activeDownloads.length + 1;
    }

    decParallelStreams() {
        this.parallelStreams = this._activeDownloads.length - 1;
    }

    waitForStreamToEnd() {
        return Promise.race(this._activeDownloads);
    }

    public async download(): Promise<void> {
        if (this._parallelStreams === 1) {
            return await this._downloadSlice(0, this.savedProgress.chunks.length);
        }

        this._createFirstSlices();

        while (!this._aborted) {
            if (this._activeDownloads.length >= this._parallelStreams) {
                await this._waitForStreamEndWithReload();
                continue;
            }

            const slice = this._createOneSlice();
            if (slice == null) {
                if (this._activeDownloads.length === 0) {
                    break;
                }
                await this._waitForStreamEndWithReload();
                continue;
            }
            this._createDownload(slice);
        }
    }

    private async _waitForStreamEndWithReload() {
        const promiseResolvers = promiseWithResolvers<void>();
        this._reload = promiseResolvers.resolve;
        return await Promise.race(this._activeDownloads.concat([promiseResolvers.promise]));
    }

    private _createDownload(slice: ProgramSlice) {
        const promise = this._downloadSlice(slice.start, slice.end);
        this._activeDownloads.push(promise);
        promise.then(() => {
            this._activeDownloads.splice(this._activeDownloads.indexOf(promise), 1);
        });
    }

    /**
     * Create all the first slices at one - make sure they will not overlap to reduce stream aborts at later stages
     */
    private _createFirstSlices() {
        const slices: ProgramSlice[] = [];
        for (let i = 0; i < this.parallelStreams; i++) {
            const slice = this._createOneSlice();
            if (slice) {
                const lastSlice = slices.find(x => x.end > slice.start && x.start < slice.start);
                if (lastSlice) {
                    lastSlice.end = slice.start;
                }
                this.savedProgress.chunks[slice.start] = ChunkStatus.IN_PROGRESS;
                slices.push(slice);
            } else {
                break;
            }
        }

        for (const slice of slices) {
            this._createDownload(slice);
        }
    }

    protected abstract _createOneSlice(): ProgramSlice | null;

    public abort() {
        this._aborted = true;
    }
}
