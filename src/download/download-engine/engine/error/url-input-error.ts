import EngineError from "./engine-error.js";

export default class UrlInputError extends EngineError {
    constructor(message: string) {
        super(message);
    }
}
