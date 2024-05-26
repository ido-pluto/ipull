import HttpError from "./http-error.js";

export default class InvalidContentLengthError extends HttpError {
    constructor(expectedLength: number, gotLength: number | string) {
        super(`Expected ${expectedLength} bytes, but got ${gotLength} bytes. If you on browser try to set "ignoreIfRangeWithQueryParams" to true, this will add a "_ignore" query parameter to the URL to avoid chrome "if-range" header.`);
    }
}
