import { promises as fs } from "fs";
import path from "path";

export async function ensureFile(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
        await fs.access(filePath);
    } catch {
        await fs.writeFile(filePath, "");
    }
}

export async function pathExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

export async function readJSON<T = any>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
}