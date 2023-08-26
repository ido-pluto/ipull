import {fileURLToPath} from "url";
import FastDownload from "./stream-progress/fast-download.js";
import CLIPullProgress from "./cli-pull-progress.js";
import {IStreamProgress} from "./stream-progress/istream-progress.js";
import CopyProgress from "./stream-progress/copy-progress.js";

export default async function pullFileCLI(url: string, savePath: string, name: string) {
    let progressStream: IStreamProgress;

    if (url.startsWith("http")) {
        progressStream = new FastDownload(url, savePath);
    } else if (url.startsWith("file")) {
        progressStream = new CopyProgress(fileURLToPath(url), savePath);
    } else {
        throw new Error("Unknown download protocol");
    }

    await progressStream.init();

    const progress = new CLIPullProgress(progressStream, name);
    await progress.startPull();
}
