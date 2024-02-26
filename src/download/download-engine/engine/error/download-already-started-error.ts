export default class DownloadAlreadyStartedError extends Error {
    public constructor() {
        super("Download already started");
    }
}
