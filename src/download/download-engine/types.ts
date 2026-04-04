import {DownloadEngineFilePerPartOptions} from "./download-file/download-engine-file.js";
import {InputRange} from "./engine/base-download-engine.js";
import BaseDownloadEngineFetchStream from "./streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";

export type DownloadFilePart = DownloadEngineFilePerPartOptions & {
    downloadURL: string
    originalURL: string
    acceptRange: boolean
    remoteFileSize: number;
    downloadSize: number
    downloadURLUpdateDate: number
    fetchStream: BaseDownloadEngineFetchStream;
    range: InputRange;
};

export enum ChunkStatus {
    NOT_STARTED,
    IN_PROGRESS,
    COMPLETE
}

export type SaveProgressInfo = {
    downloadId: string,
    part: number,
    chunks: ChunkStatus[],
    chunkSize: number;
};

export type DownloadFile = {
    totalSize: number
    localFileName: string
    parts: DownloadFilePart[]
    downloadProgress?: SaveProgressInfo
};
