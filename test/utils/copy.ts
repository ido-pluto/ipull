import path from "path";
import {fileHash} from "./hash.js";

export async function copyFileTest(file: string) {
    const fileToCopy = file;
    const originalFileHash = await fileHash(fileToCopy);
    const copyFileToName = "copied-file" + path.extname(fileToCopy);

    return {
        fileToCopy,
        originalFileHash,
        copyFileToName
    };
}
