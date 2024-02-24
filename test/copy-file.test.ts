import {describe, expect, test} from "vitest";
import fs from "fs-extra";
import {copyFile, DownloadEngineFetchStreamLocalFile, DownloadEngineFile} from "../src/index.js";
import DownloadEngineWriteStreamBrowser
    from "../src/download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import {createDownloadFile, TEXT_FILE_EXAMPLE} from "./utils/download.js";
import {fileHash} from "./utils/hash.js";
import {copyFileTest} from "./utils/copy.js";

describe("File Copy", () => {
    test("copy text file", async () => {
        const {originalFileHash, fileToCopy, copyFileToName} = await copyFileTest(TEXT_FILE_EXAMPLE);

        const engine = await copyFile(fileToCopy, {
            fileName: copyFileToName,
            chunkSize: 4,
            parallelStreams: 8
        });
        await engine.download();

        const copiedFileHash = await fileHash(copyFileToName);
        expect(copiedFileHash)
            .toBe(originalFileHash);
        await fs.remove(copyFileToName);
    });

    test("copy image", async () => {
        const {originalFileHash, fileToCopy, copyFileToName} = await copyFileTest(TEXT_FILE_EXAMPLE);


        const engine = await copyFile(fileToCopy, {
            fileName: copyFileToName
        });
        await engine.download();

        const copiedFileHash = await fileHash(copyFileToName);
        expect(copiedFileHash)
            .toBe(originalFileHash);
        await fs.remove(copyFileToName);
    });


    test("Total bytes written", async () => {
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
        expect(totalBytesWritten)
            .toBe(file.totalSize);
    });
});
