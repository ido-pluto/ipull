export type ProgressStatus = {
    downloadId: string,
    totalBytes: number,
    totalDownloadParts: number,
    fileName: string,
    comment?: string,
    downloadPart: number,
    transferredBytes: number,
    startTime: number,
    endTime: number,
    transferAction: string
    downloadStatus: DownloadStatus
    downloadFlags: DownloadFlags[]
    retrying: boolean
    retryingTotalAttempts: number
    streamsNotResponding: number
};

export enum DownloadStatus {
    Loading = "Loading",
    Active = "Active",
    Paused = "Paused",
    NotStarted = "NotStarted",
    Finished = "Finished",
    Cancelled = "Cancelled",
    Error = "Error"
}

export enum DownloadFlags {
    Existing = "Existing",
    DownloadSequence = "DownloadSequence"
}


export const EMPTY_PROGRESS_STATUS: ProgressStatus = {
    transferAction: "Transferring",
    downloadStatus: DownloadStatus.Loading,
    downloadFlags: [],
    retrying: false,
    retryingTotalAttempts: 0,
    streamsNotResponding: 0,
    downloadId: "",
    totalBytes: 0,
    totalDownloadParts: 0,
    fileName: "???",
    comment: "",
    downloadPart: 0,
    transferredBytes: 0,
    startTime: 0,
    endTime: 0
};