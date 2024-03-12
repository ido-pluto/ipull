import EngineError from "./engine-error.js";

export default class DownloadAlreadyStartedError extends EngineError {
    public constructor() {
        super("Download already started");
    }
}
