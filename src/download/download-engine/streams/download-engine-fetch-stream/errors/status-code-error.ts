import HttpError from "./http-error.js";

export default class StatusCodeError extends HttpError {
    constructor(
        public readonly url: string,
        public readonly statusCode: number,
        public readonly statusText: string,
        public headers?: { [key: string]: string | string[] }) {
        super();
        this.message = `Url: ${url}, Status code: ${statusCode}, status text: ${statusText}`;
    }
}
