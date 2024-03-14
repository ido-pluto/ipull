import {ChunkStatus, SaveProgressInfo} from "../../types.js";
import BaseDownloadStream, {DownloadSlice, ProgramSlice} from "./base-download-stream.js";

export default class DownloadProgramChunks extends BaseDownloadStream {
    public constructor(savedProgress: SaveProgressInfo, downloadSlice: DownloadSlice) {
        super(savedProgress, downloadSlice);
    }

    protected _createOneSlice(): ProgramSlice | null {
        const notDownloadedIndex = this.savedProgress.chunks.findIndex(c => c === ChunkStatus.NOT_STARTED);
        if (notDownloadedIndex === -1) return null;

        return {start: notDownloadedIndex, end: notDownloadedIndex + 1};
    }
}
