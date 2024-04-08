import {SaveProgressInfo} from "../../types.js";
import {DownloadSlice} from "./base-download-program.js";
import DownloadProgramChunks from "./download-program-chunks.js";
import DownloadProgramStream from "./download-program-stream.js";

export type AvailablePrograms = "stream" | "chunks";

export default function switchProgram(savedProgress: SaveProgressInfo, downloadSlice: DownloadSlice, name?: AvailablePrograms) {
    switch (name) {
        case "chunks":
            return new DownloadProgramChunks(savedProgress, downloadSlice);
        case "stream":
        default:
            return new DownloadProgramStream(savedProgress, downloadSlice);
    }
}
