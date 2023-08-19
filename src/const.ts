import {fileURLToPath} from "url";
import path from "path";
import fs from "fs-extra";

export const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const packageJson = await fs.readJSON(path.join(__dirname, "..", "package.json"));
export const TRUNCATE_TEXT_MAX_LENGTH = 30;

export const DB_PATH = path.join(__dirname, "..", "db.json");

