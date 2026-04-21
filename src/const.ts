import {fileURLToPath} from "url";
import path from "path";
import { readJSON } from "./utils/fs.js";

export const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const packageJson = await readJSON(path.join(__dirname, "..", "package.json"));

export const DB_PATH = path.join(__dirname, "..", "db.json");

