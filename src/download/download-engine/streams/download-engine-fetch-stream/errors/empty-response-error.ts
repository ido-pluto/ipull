export default class EmptyResponseError extends Error {
    constructor(url: string, public readonly headers: { [key: string]: string | string[] }) {
        super("Empty response error: " + url);
    }
}
