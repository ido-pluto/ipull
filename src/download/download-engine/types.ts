export type DownloadFilePart = {
    downloadURL: string
    originalURL: string
    acceptRange: boolean
    size: number
    downloadURLUpdateDate: number
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
    chunkSize: number,
    parallelStreams: number
};

export type DownloadFile = {
    totalSize: number
    localFileName: string
    parts: DownloadFilePart[]
    downloadProgress?: SaveProgressInfo
};
