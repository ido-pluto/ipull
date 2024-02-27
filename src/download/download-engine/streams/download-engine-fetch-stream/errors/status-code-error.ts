import FetchStreamError from "./fetch-stream-error.js";

export default class StatusCodeError extends FetchStreamError {
    constructor(
        public readonly url: string,
        public readonly statusCode: number,
        public readonly statusText: string,
        public headers?: { [key: string]: string | string[] }) {
        super();
        this.message = `Url: ${url}, Status code: ${statusCode}, status text: ${statusText}`;
    }
}
