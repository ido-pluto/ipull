import path from "path";
import fs from "fs-extra";
import {getWithDefault} from "../../settings/settings.js";

const DEFAULT_DOWNLOAD_DIR = process.cwd();

export default async function findDownloadDir(fileName: string) {
    const downloadLocation = await getWithDefault(path.extname(fileName));
    const defaultLocation = await getWithDefault("default");
    return downloadLocation || defaultLocation || DEFAULT_DOWNLOAD_DIR;
}

export async function downloadToDirectory(path: string) {
    try {
        const stats = await fs.lstat(path);
        return stats.isDirectory();
    } catch {
        return false;
    }
}
