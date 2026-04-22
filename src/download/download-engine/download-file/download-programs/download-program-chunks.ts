import {ChunkStatus, SaveProgressInfo} from "../../types.js";
import BaseDownloadProgram, {DownloadSlice, ProgramSlice} from "./base-download-program.js";

export default class DownloadProgramChunks extends BaseDownloadProgram {
    public constructor(savedProgress: SaveProgressInfo, parallelStreams: number, downloadSlice: DownloadSlice) {
        super(savedProgress, parallelStreams, downloadSlice);
    }

    protected _createOneSlice(): ProgramSlice | null {
        const notDownloadedIndex = this.savedProgress.chunks.findIndex(c => c === ChunkStatus.NOT_STARTED);
        if (notDownloadedIndex === -1) return null;

        return {start: notDownloadedIndex, end: notDownloadedIndex + 1};
    }
}
