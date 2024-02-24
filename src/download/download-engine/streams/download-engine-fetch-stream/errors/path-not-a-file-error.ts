export default class PathNotAFileError extends Error {
    constructor(path: string) {
        super(`Path is not a file: ${path}`);
    }
}
