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
};

export default class ProgressStatusFile {
    public readonly totalBytes: number;
    public readonly totalDownloadParts: number;
    public readonly fileName: string;
    public readonly comment?: string;
    public readonly downloadPart: number;
    public readonly transferredBytes: number;
    public readonly transferAction: string;
    public startTime: number = 0;
    public endTime: number = 0;

    public constructor(
        totalBytes: number,
        totalDownloadParts: number,
        fileName: string,
        comment?: string,
        transferAction = "Transferring",
        downloadPart = 0,
        transferredBytes = 0
    ) {
        this.transferAction = transferAction;
        this.transferredBytes = transferredBytes;
        this.downloadPart = downloadPart;
        this.comment = comment;
        this.fileName = fileName;
        this.totalDownloadParts = totalDownloadParts;
        this.totalBytes = totalBytes;
    }

    public started() {
        this.startTime = Date.now();
    }

    public finished() {
        this.endTime = Date.now();
    }

    public createStatus(downloadPart: number, transferredBytes: number): ProgressStatusFile {
        return new ProgressStatusFile(this.totalBytes, this.totalDownloadParts, this.fileName, this.comment, this.transferAction, downloadPart, transferredBytes);
    }
}
