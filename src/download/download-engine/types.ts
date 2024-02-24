import retry from "async-retry";
import ProgressStatusFile from "./progress-status-file.js";
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
    chunkSize: number;
    parallelStreams: number;
    onProgress?: (status: ProgressStatusFile) => void | Promise<void>;
    onFinished?: () => void | Promise<void>;
    onClosed?: () => void | Promise<void>;
    onStart?: () => void | Promise<void>;
    saveProgress?: (progress: DownloadProgressInfo) => void | Promise<void>;
    retry?: retry.Options
    objectType?: string;
    fetchStream: BaseDownloadEngineFetchStream,
    writeStream: BaseDownloadEngineWriteStream
};
