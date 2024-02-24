import {DownloadFile} from "../types.js";
import DownloadEngineFile from "../download-engine-file.js";
import BaseDownloadEngineFetchStream from "../streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";

export default class BaseDownloadEngine {

    get file() {
        return this._engine.file;
    }

    protected constructor(protected readonly _engine: DownloadEngineFile) {
    }

    async download() {
        await this._engine.download();
        await this.abort();
    }

    pause() {
        return this._engine.pause();
    }

    resume() {
        return this._engine.resume();
    }

    abort() {
        return this._engine.close();
    }

    [Symbol.dispose]() {
        return this.abort();
    }

    protected static async _createDownloadFile(parts: string | string[], fetchStream: BaseDownloadEngineFetchStream) {
        parts = [parts].flat();
        const localFileName = new URL(parts[0], "https://example").pathname.split("/")
            .pop() || "";
        const downloadFile: DownloadFile = {
            totalSize: 0,
            parts: [],
            localFileName
        };

        for (const part of parts) {
            const {length, acceptRange} = await fetchStream.fetchDownloadInfo(part);
            downloadFile.totalSize += length;
            downloadFile.parts.push({
                downloadURL: part,
                size: length,
                acceptRange
            });
        }

        return downloadFile;
    }

}
