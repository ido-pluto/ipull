import {ChunkStatus, SaveProgressInfo} from "../types.js";

export type ProgramSlice = {
    start: number,
    end: number
};

export default class DownloadProgram {

    private _savedProgress: SaveProgressInfo;
    private readonly _downloadSlice: (startChunk: number, endChunk: number) => Promise<void>;

    public constructor(_savedProgress: SaveProgressInfo, _downloadSlice: (startChunk: number, endChunk: number) => Promise<void>) {
        this._downloadSlice = _downloadSlice;
        this._savedProgress = _savedProgress;
        this._findChunksSlices();
    }

    public async download() {
        if (this._savedProgress.parallelStreams === 1) {
            return await this._downloadSlice(0, this._savedProgress.chunks.length);
        }

        const activeDownloads: Promise<any>[] = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const slice = this._createOneSlice();
            if (slice == null) break;

            while (activeDownloads.length >= this._savedProgress.parallelStreams) {
                await Promise.race(activeDownloads);
            }

            const promise = this._downloadSlice(slice.start, slice.end);
            activeDownloads.push(promise);
            promise.then(() => {
                activeDownloads.splice(activeDownloads.indexOf(promise), 1);
            });
        }

        await Promise.all(activeDownloads);
    }

    private _createOneSlice(): ProgramSlice | null {
        const slice = this._findChunksSlices()[0];
        if (!slice) return null;
        const length = slice.end - slice.start;
        return {start: Math.floor(slice.start + length / 2), end: slice.end};
    }

    private _findChunksSlices() {
        const chunksSlices: ProgramSlice[] = [];

        let start = 0;
        let currentIndex = 0;
        for (const chunk of this._savedProgress.chunks) {
            if (chunk !== ChunkStatus.NOT_STARTED) {
                if (start === currentIndex) {
                    start = ++currentIndex;
                    continue;
                }
                chunksSlices.push({start, end: currentIndex});
                start = ++currentIndex;
                continue;
            }

            currentIndex++;
        }

        if (start !== currentIndex) {
            chunksSlices.push({start, end: currentIndex});
        }

        return chunksSlices.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    }
}
