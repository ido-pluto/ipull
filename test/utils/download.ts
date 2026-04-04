import fs from "fs-extra";
import fsPromise from "fs/promises";
import {withLock} from "lifecycle-utils";
import path from "path";
import {fileURLToPath} from "url";
import {AvailablePrograms} from "../../src/download/download-engine/download-file/download-programs/switch-program.js";
import DownloadEngineFetchStreamFetch from "../../src/download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import {DownloadFile} from "../../src/download/download-engine/types.js";
import {BIG_FILE} from "./files.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const BIG_FILE_EXAMPLE = path.join(__dirname, "files", "big-file.bin");
export const TEXT_FILE_EXAMPLE = path.join(__dirname, "files", "example.txt");

const lockScope = {};

export async function ensureLocalFile(download: string, local: string) {
    return await withLock([lockScope, local], async function ensureLocalFileWithoutLock() {
        if (await fs.pathExists(local)) {
            return local;
        }

        const response = await fetch(download);
        await fsPromise.writeFile(local, Buffer.from(await response.arrayBuffer()));

        return local;
    });
}

type CreateDownloadFileOptions = {
    parallelStreams?: number;
    autoIncreaseParallelStreams?: boolean;
    programType?: AvailablePrograms;
};
export async function createDownloadFile(file = BIG_FILE, {parallelStreams = 3, autoIncreaseParallelStreams = true, programType = "stream"}: CreateDownloadFileOptions = {}): Promise<DownloadFile> {
    const fetchStream = new DownloadEngineFetchStreamFetch();
    fetchStream.addListener("streamNotRespondingOn", () => {
        console.warn("Stream is not responding, but ignoring since it's expected in tests");
    });
    fetchStream.addListener("errorCountIncreased", (error) => {
        console.warn("Error count increased, but ignoring since it's expected in tests", error);
    });

    const fileInfo = await fetchStream.fetchDownloadInfo(file);

    return {
        localFileName: path.basename(file),
        totalSize: fileInfo.length,
        parts: [
            {
                downloadURL: file,
                acceptRange: fileInfo.acceptRange,
                remoteFileSize: fileInfo.length,
                originalURL: file,
                downloadURLUpdateDate: Date.now(),
                parallelStreams,
                autoIncreaseParallelStreams,
                fetchStream,
                programType,
                range: {
                    start: 0,
                    end: fileInfo.length - 1
                },
                downloadSize: fileInfo.length
            }
        ]
    };
}
