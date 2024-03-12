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

export type SaveProgressInfo = {
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
