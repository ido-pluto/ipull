import path from "path";
import {Command} from "commander";
import {packageJson} from "../const.js";
import {downloadFile} from "../download/node-download.js";
import {setCommand} from "./commands/set.js";
import findDownloadDir, {downloadToDirectory, findFileName} from "./utils/find-download-dir.js";


const pullCommand = new Command();
pullCommand
    .version(packageJson.version)
    .description("Pull/copy files from remote server/local directory")
    .argument("[files...]", "Files to pull/copy")
    .option("-s --save [path]", "Save location (directory/file)")
    .option("-c --connections [number]", "Number of parallel connections", "4")
    .option("-f --full-name", "Show full name of the file while downloading, even if it long")
    .action(async (files: string[] = [], {save: saveLocation, fullName, number}: { save?: string, fullName?: boolean, number: string }) => {
        if (files.length === 0) {
            pullCommand.outputHelp();
            process.exit(0);
        }

        let counter = 1;
        for (const file of files) {
            const isDirectory = saveLocation && await downloadToDirectory(saveLocation);
            const directory = isDirectory ? saveLocation : await findDownloadDir(findFileName(file));
            const fileName = isDirectory || !saveLocation ? "" : path.basename(saveLocation);
            const comment = files.length > 1 ? `${counter++}/${files.length}` : "";

            const downloader = await downloadFile({
                url: file,
                directory,
                fileName,
                truncateName: !fullName,
                comment,
                parallelStreams: Number(number) || 4
            });
            await downloader.download();
        }
    });

pullCommand.addCommand(setCommand);
pullCommand.parse();
