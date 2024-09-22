export type ProgressStatus = {
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
};

export enum DownloadStatus {
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

export default class ProgressStatusFile {
    public readonly totalDownloadParts: number;
    public readonly fileName: string;
    public readonly comment?: string;
    public readonly downloadPart: number;
    public readonly transferredBytes: number;
    public readonly transferAction: string;
    public readonly downloadStatus: DownloadStatus = DownloadStatus.Active;
    public downloadFlags: DownloadFlags[] = [];
    public totalBytes: number = 0;
    public startTime: number = 0;
    public endTime: number = 0;

    public constructor(
        totalDownloadParts: number,
        fileName: string,
        transferAction = "Transferring",
        downloadFlags: DownloadFlags[] = [],
        comment?: string,
        downloadPart = 0,
        transferredBytes = 0,
        downloadStatus = DownloadStatus.Active
    ) {
        this.transferAction = transferAction;
        this.transferredBytes = transferredBytes;
        this.downloadPart = downloadPart;
        this.comment = comment;
        this.fileName = fileName;
        this.totalDownloadParts = totalDownloadParts;
        this.downloadFlags = downloadFlags;
        this.downloadStatus = downloadStatus;
    }

    public started() {
        this.startTime = Date.now();
    }

    public finished() {
        this.endTime = Date.now();
    }

    public createStatus(downloadPart: number, transferredBytes: number, totalBytes = this.totalBytes, downloadStatus = DownloadStatus.Active, comment = this.comment): ProgressStatusFile {
        const newStatus = new ProgressStatusFile(
            this.totalDownloadParts,
            this.fileName,
            this.transferAction,
            this.downloadFlags,
            comment,
            downloadPart,
            transferredBytes,
            downloadStatus
        );

        newStatus.totalBytes = totalBytes;
        newStatus.startTime = this.startTime;
        newStatus.endTime = this.endTime;

        return newStatus;
    }
}
