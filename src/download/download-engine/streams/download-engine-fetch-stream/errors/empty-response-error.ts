import FetchStreamError from "./fetch-stream-error.js";

export default class EmptyResponseError extends FetchStreamError {
    constructor(url: string, public readonly headers: { [key: string]: string | string[] }) {
        super("Empty response error: " + url);
    }
}
