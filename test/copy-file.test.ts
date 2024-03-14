import {describe, test} from "vitest";
import fs from "fs-extra";
import {BIG_FILE_EXAMPLE, ensureLocalFile, TEXT_FILE_EXAMPLE} from "./utils/download.js";
import {fileHash} from "./utils/hash.js";
import {copyFileInfo} from "./utils/copy.js";
import {downloadFile} from "../src/index.js";
import {BIG_FILE} from "./utils/files.js";

describe("File Copy", async () => {

    test.concurrent("copy text parallel streams", async (context) => {
        const {originalFileHash, fileToCopy, copyFileToName} = await copyFileInfo(TEXT_FILE_EXAMPLE);

        const engine = await downloadFile({
            url: fileToCopy,
            directory: ".",
            fileName: copyFileToName,
            chunkSize: 4,
            parallelStreams: 1,
            fetchStrategy: "localFile",
            cliProgress: false
        });
        await engine.download();

        const copiedFileHash = await fileHash(copyFileToName);
        await fs.remove(copyFileToName);

        context.expect(copiedFileHash)
            .toBe(originalFileHash);
    });

    test.concurrent("copy image one stream", async (context) => {
        const imagePath = await ensureLocalFile(BIG_FILE, BIG_FILE_EXAMPLE);
        const {originalFileHash, fileToCopy, copyFileToName} = await copyFileInfo(imagePath);

        const engine = await downloadFile({
            url: fileToCopy,
            directory: ".",
            fileName: copyFileToName,
            fetchStrategy: "localFile",
            cliProgress: false,
            parallelStreams: 1
        });
        await engine.download();

        const copiedFileHash = await fileHash(copyFileToName);
        await fs.remove(copyFileToName);

        context.expect(copiedFileHash)
            .toBe(originalFileHash);
    });
}, {timeout: 1000 * 60 * 3});
