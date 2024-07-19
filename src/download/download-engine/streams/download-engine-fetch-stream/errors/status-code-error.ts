import HttpError from "./http-error.js";

export default class StatusCodeError extends HttpError {
    constructor(
        public readonly url: string,
        public readonly statusCode: number,
        public readonly statusText: string,
        public headers?: { [key: string]: string | string[] },
        public responseHeaders?: { [key: string]: string }
    ) {
        super();
        this.message = `Url: ${url}, Status code: ${statusCode}, status text: ${statusText}`;
    }

    get retryAfter(): number | undefined {
        const retryAfter = this.responseHeaders?.["retry-after"];
        if (retryAfter) {
            const number = parseInt(retryAfter, 10);
            if (isNaN(number)) {
                return new Date(retryAfter).getTime() - Date.now();
            }
            return number;
        } else if (this.responseHeaders?.["ratelimit-reset"]) {
            return parseInt(this.responseHeaders["ratelimit-reset"], 10) * 1000;
        }

        return;
    }
}
