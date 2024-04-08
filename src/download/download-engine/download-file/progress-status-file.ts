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
};

export enum DownloadStatus {
    Active = "Active",
    Paused = "Paused",
    Finished = "Finished",
    Cancelled = "Cancelled",
    Error = "Error"
}

export default class ProgressStatusFile {
    public readonly totalBytes: number;
    public readonly totalDownloadParts: number;
    public readonly fileName: string;
    public readonly comment?: string;
    public readonly downloadPart: number;
    public readonly transferredBytes: number;
    public readonly transferAction: string;
    public readonly downloadStatus: DownloadStatus = DownloadStatus.Active;
    public startTime: number = 0;
    public endTime: number = 0;

    public constructor(
        totalBytes: number,
        totalDownloadParts: number,
        fileName: string,
        comment?: string,
        transferAction = "Transferring",
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
        this.totalBytes = totalBytes;
        this.downloadStatus = downloadStatus;
    }

    public started() {
        this.startTime = Date.now();
    }

    public finished() {
        this.endTime = Date.now();
    }

    public createStatus(downloadPart: number, transferredBytes: number, downloadStatus = DownloadStatus.Active): ProgressStatusFile {
        const newStatus = new ProgressStatusFile(
            this.totalBytes,
            this.totalDownloadParts,
            this.fileName,
            this.comment,
            this.transferAction,
            downloadPart,
            transferredBytes,
            downloadStatus
        );

        newStatus.startTime = this.startTime;
        newStatus.endTime = this.endTime;

        return newStatus;
    }
}
