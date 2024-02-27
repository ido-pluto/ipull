import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import {DownloadFile} from "../../src/download/download-engine/types.js";
import {BIG_IMAGE} from "./files.js";
import {downloadFile} from "../../src/index.js";
import BaseDownloadEngineFetchStream
    from "../../src/download/download-engine/streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import DownloadEngineFetchStreamFetch
    from "../../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const EXAMPLE_FILE = path.join(__dirname, "files", "big-image.jpg");
export const TEXT_FILE_EXAMPLE = path.join(__dirname, "files", "example.txt");

export async function ensureLocalFile(download = BIG_IMAGE, local = EXAMPLE_FILE) {
    if (await fs.pathExists(local)) {
        return local;
    }

    const downloader = await downloadFile({
        url: download,
        savePath: local
    });

    await downloader.download();
    return local;
}


export async function createDownloadFile(file = BIG_IMAGE, fetchStream: BaseDownloadEngineFetchStream = new DownloadEngineFetchStreamFetch()): Promise<DownloadFile> {
    const fileInfo = await fetchStream.fetchDownloadInfo(file);

    return {
        localFileName: path.basename(file),
        totalSize: fileInfo.length,
        parts: [
            {
                downloadURL: file,
                acceptRange: fileInfo.acceptRange,
                size: fileInfo.length
            }
        ]
    };
}
