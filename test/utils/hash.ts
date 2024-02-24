import * as crypto from "crypto";
import fs from "fs-extra";

export function hashBuffer(bufferData: Uint8Array | Buffer) {
    const hash = crypto.createHash("sha256");
    hash.update(bufferData);
    return hash.digest("hex");
}

export async function fileHash(location: string) {
    const content = await fs.readFile(location);
    return hashBuffer(content);
}
