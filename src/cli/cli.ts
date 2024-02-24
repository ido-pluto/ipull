#!/usr/bin/env node

import path from "path";
import {Command} from "commander";
import {packageJson} from "../const.js";
import {copyFile, downloadFile} from "../download/node-download.js";
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
            const objectType = files.length > 1 ? `${counter++}/${files.length}` : "";

            const options = {
                directory,
                fileName,
                truncateName: !fullName,
                objectType,
                parallelStreams: Number(number) || 4
            };

            const downloadStrategy = file.startsWith("http") ? downloadFile : copyFile;
            const downloader = await downloadStrategy(file, options);
            await downloader.download();
        }
    });

pullCommand.addCommand(setCommand);
pullCommand.parse();
