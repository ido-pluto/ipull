import retry from "async-retry";
import BaseDownloadEngineFetchStream from "./streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import BaseDownloadEngineWriteStream from "./streams/download-engine-write-stream/base-download-engine-write-stream.js";

export type DownloadFilePart = {
    downloadURL?: string
    acceptRange?: boolean
    size: number
};

export enum ChunkStatus {
    NOT_STARTED,
    IN_PROGRESS,
    COMPLETE
}

export type DownloadProgressInfo = {
    part: number,
    chunks: ChunkStatus[],
    chunkSize: number,
};

export type DownloadFile = {
    totalSize: number
    localFileName: string
    parts: DownloadFilePart[]
    downloadProgress?: DownloadProgressInfo
};

export type DownloadEngineFileOptions = {
    chunkSize?: number;
    parallelStreams?: number;
    retry?: retry.Options
    comment?: string;
    fetchStream: BaseDownloadEngineFetchStream,
    writeStream: BaseDownloadEngineWriteStream
};
