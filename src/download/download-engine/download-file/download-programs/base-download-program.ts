import {SaveProgressInfo} from "../../types.js";

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


        // eslint-disable-next-line no-constant-condition
        while (true) {
            while (this._activeDownloads.length >= this._parallelStreams) {
                if (this._aborted) return;
                const promiseResolvers = Promise.withResolvers<void>();
                this._reload = promiseResolvers.resolve;

                await Promise.race(this._activeDownloads.concat([promiseResolvers.promise]));
            }

            const slice = this._createOneSlice();
            if (slice == null) break;

            if (this._aborted) return;
            const promise = this._downloadSlice(slice.start, slice.end);
            this._activeDownloads.push(promise);
            promise.then(() => {
                this._activeDownloads.splice(this._activeDownloads.indexOf(promise), 1);
            });
        }

        await Promise.all(this._activeDownloads);
    }

    protected abstract _createOneSlice(): ProgramSlice | null;

    public abort() {
        this._aborted = true;
    }
}
