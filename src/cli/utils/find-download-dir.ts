import {getWithDefault} from "../../settings/settings.js";
import path from "path";

const DEFAULT_DOWNLOAD_DIR = process.cwd();

export default async function findDownloadDir(fileName: string) {
    const downloadLocation = await getWithDefault(path.extname(fileName));
    const defaultLocation = await getWithDefault("default");
    return downloadLocation || defaultLocation || DEFAULT_DOWNLOAD_DIR;
}
