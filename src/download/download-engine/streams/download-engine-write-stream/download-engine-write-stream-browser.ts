import retry from "async-retry";
import BaseDownloadEngineWriteStream from "./base-download-engine-write-stream.js";

type DownloadEngineWriteStreamOptionsBrowser = {
    retry?: retry.Options
};

export type DownloadEngineWriteStreamBrowserWriter = (cursor: number, buffer: Uint8Array, options: DownloadEngineWriteStreamOptionsBrowser) => Promise<void> | void;

export default class DownloadEngineWriteStreamBrowser extends BaseDownloadEngineWriteStream {
    constructor(protected _writer: DownloadEngineWriteStreamBrowserWriter, public readonly options: DownloadEngineWriteStreamOptionsBrowser = {}) {
        super();
    }

    write(cursor: number, buffer: Uint8Array) {
        return this._writer(cursor, buffer, this.options);
    }

    static memoryWriter() {
        let buffer = new Uint8Array(0);

        return {
            async writer(offset: number, data: Uint8Array) {
                buffer.set(data, offset);
            },
            setLength(length: number) {
                buffer = new Uint8Array(length);
            },
            get buffer() {
                return buffer;
            },
            createBlobURL(type = "image/png") {
                const blob = new Blob([buffer], {type});
                return URL.createObjectURL(blob);
            }
        };
    }
}
