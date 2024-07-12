import EngineError from "./engine-error.js";

export class InvalidOptionError extends EngineError {
    constructor(message: string) {
        super(message);
    }
}
