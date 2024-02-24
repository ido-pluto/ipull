export default class ProgressStatusFile {
    constructor(
        public readonly totalBytes: number,
        public readonly totalDownloadParts: number,
        public readonly fileName: string,
        public readonly objectType?: string,
        public readonly downloadPart: number = 0,
        public readonly bytesDownloaded: number = 0
    ) {
    }

    createStatus(downloadPart: number, bytesDownloaded: number): ProgressStatusFile {
        return new ProgressStatusFile(this.totalBytes, this.totalDownloadParts, this.fileName, this.objectType, downloadPart, bytesDownloaded);
    }
}
