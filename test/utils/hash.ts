import fs from "fs-extra";
import hash from "hash.js";

export function hashBuffer(bufferData: Uint8Array) {
    return hash.sha256()
        .update(bufferData)
        .digest("hex");
}

export async function fileHash(location: string) {
    const content = await fs.readFile(location);
    return hashBuffer(content);
}
