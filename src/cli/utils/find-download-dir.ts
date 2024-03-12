import path from "path";
import fs from "fs-extra";
import {AppDB} from "../../settings/settings.js";

const DEFAULT_DOWNLOAD_DIR = process.cwd();

export default async function findDownloadDir(fileName?: string) {
    const downloadLocation = AppDB.data[path.extname(fileName || "")];
    const defaultLocation = AppDB.data["default"];
    return downloadLocation || defaultLocation || DEFAULT_DOWNLOAD_DIR;
}

export function findFileName(url: string) {
    try {
        return path.basename(new URL(url).pathname);
    } catch {
        return path.basename(url);
    }
}

export async function downloadToDirectory(path: string) {
    try {
        const stats = await fs.lstat(path);
        return stats.isDirectory();
    } catch {
        return false;
    }
}
