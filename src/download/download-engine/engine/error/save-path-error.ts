import EngineError from "./engine-error.js";

export default class SavePathError extends EngineError {
    constructor(message: string) {
        super(message);
    }
}
