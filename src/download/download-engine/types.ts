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
