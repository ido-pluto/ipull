import {afterAll, describe, test} from "vitest";
import fs from "fs-extra";
import {copyFile, DownloadEngineFetchStreamLocalFile, DownloadEngineFile} from "../src/index.js";
import DownloadEngineWriteStreamBrowser
    from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import {createDownloadFile, TEXT_FILE_EXAMPLE} from "./utils/download.js";
import {fileHash} from "./utils/hash.js";
import {copyFileTest} from "./utils/copy.js";

describe("File Copy", async () => {
    const {originalFileHash, fileToCopy, copyFileToName} = await copyFileTest(TEXT_FILE_EXAMPLE);

    test.concurrent("copy text file", async (context) => {
        const engine = await copyFile(fileToCopy, {
            fileName: copyFileToName,
            chunkSize: 4,
            parallelStreams: 8,
            cliProgress: false
        });
        await engine.download();

        const copiedFileHash = await fileHash(copyFileToName);
        context.expect(copiedFileHash)
            .toBe(originalFileHash);
    });

    test.concurrent("copy image", async (context) => {
        const engine = await copyFile(fileToCopy, {
            fileName: copyFileToName,
            cliProgress: false
        });
        await engine.download();

        const copiedFileHash = await fileHash(copyFileToName);
        context.expect(copiedFileHash)
            .toBe(originalFileHash);
    });


    test.concurrent("Total bytes written", async (context) => {
        let totalBytesWritten = 0;
        const fetchStream = new DownloadEngineFetchStreamLocalFile();
        const writeStream = new DownloadEngineWriteStreamBrowser((cursor, data) => {
            totalBytesWritten += data.byteLength;
        });

        const file = await createDownloadFile(TEXT_FILE_EXAMPLE, fetchStream);
        const downloader = new DownloadEngineFile(file, {
            chunkSize: 4,
            parallelStreams: 8,
            fetchStream,
            writeStream
        });

        await downloader.download();
        context.expect(totalBytesWritten)
            .toBe(file.totalSize);
    });

    afterAll(async () => {
        await fs.remove(copyFileToName);
    });
});
