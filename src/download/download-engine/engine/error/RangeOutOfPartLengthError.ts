import EngineError from "./engine-error.js";

export class RangeOutOfPartLengthError extends EngineError {
    constructor(url: string, rangeEnd: number, partLength: number) {
        super(`The specified range (${rangeEnd}) is out of the part length (${partLength}) for URL: ${url}`);
    }
}
