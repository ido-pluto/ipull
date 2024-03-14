import {ChunkStatus, SaveProgressInfo} from "../../types.js";
import BaseDownloadStream, {DownloadSlice, ProgramSlice} from "./base-download-stream.js";


export default class DownloadProgramStream extends BaseDownloadStream {
    public constructor(savedProgress: SaveProgressInfo, downloadSlice: DownloadSlice) {
        super(savedProgress, downloadSlice);
    }

    protected _createOneSlice(): ProgramSlice | null {
        const slice = this._findChunksSlices()[0];
        if (!slice) return null;
        const length = slice.end - slice.start;
        return {start: Math.floor(slice.start + length / 2), end: slice.end};
    }

    private _findChunksSlices() {
        const chunksSlices: ProgramSlice[] = [];

        let start = 0;
        let currentIndex = 0;
        for (const chunk of this.savedProgress.chunks) {
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
