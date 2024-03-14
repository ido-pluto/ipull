import {SaveProgressInfo} from "../../types.js";

export type ProgramSlice = {
    start: number,
    end: number
};

export type DownloadSlice = (startChunk: number, endChunk: number) => Promise<void>;

export default abstract class BaseDownloadStream {
    protected savedProgress: SaveProgressInfo;
    protected readonly _downloadSlice: DownloadSlice;

    protected constructor(_savedProgress: SaveProgressInfo, _downloadSlice: DownloadSlice) {
        this._downloadSlice = _downloadSlice;
        this.savedProgress = _savedProgress;
    }

    public async download() {
        if (this.savedProgress.parallelStreams === 1) {
            return await this._downloadSlice(0, this.savedProgress.chunks.length);
        }

        const activeDownloads: Promise<any>[] = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
            while (activeDownloads.length >= this.savedProgress.parallelStreams) {
                await Promise.race(activeDownloads);
            }

            const slice = this._createOneSlice();
            if (slice == null) break;

            const promise = this._downloadSlice(slice.start, slice.end);
            activeDownloads.push(promise);
            promise.then(() => {
                activeDownloads.splice(activeDownloads.indexOf(promise), 1);
            });
        }

        await Promise.all(activeDownloads);
    }

    protected abstract _createOneSlice(): ProgramSlice | null;
}
