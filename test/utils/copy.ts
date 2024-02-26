import path from "path";
import {fileHash} from "./hash.js";

export async function copyFileTest(file: string, copiedCounter = 0) {
    const fileToCopy = file;
    const originalFileHash = await fileHash(fileToCopy);
    const copyFileToName = copiedCounter + "copied-file" + path.extname(fileToCopy);

    return {
        fileToCopy,
        originalFileHash,
        copyFileToName
    };
}
