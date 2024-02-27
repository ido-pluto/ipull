export default class InvalidContentLengthError extends Error {
    constructor(expectedLength: number, gotLength: number) {
        super(`Expected ${expectedLength} bytes, but got ${gotLength} bytes. If you on browser try to set "ignoreIfRangeWithQueryParams" to true, this will add a "_ignore" query parameter to the URL to avoid chrome "if-range" header.`);
    }
}
