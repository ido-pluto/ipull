#!/usr/bin/env node
import path from "path";
import {Command} from "commander";
import {packageJson} from "../const.js";
import {downloadFile, downloadSequence} from "../download/node-download.js";
import {setCommand} from "./commands/set.js";
import findDownloadDir, {downloadToDirectory, findFileName} from "./utils/find-download-dir.js";


const pullCommand = new Command();
pullCommand
    .description("Pull/copy files from remote server/local directory")
    .argument("[files...]", "Files to pull/copy")
    .option("-s --save [path]", "Save location (directory/file)")
    .option("-c --connections [number]", "Number of parallel connections", "4")
    .option("-t --truncate-name", "Truncate file names in the CLI status to make them appear shorter")
    .action(async (files: string[] = [], {save: saveLocation, truncateName, number}: { save?: string, truncateName?: boolean, number: string }) => {
        if (files.length === 0) {
            pullCommand.outputHelp();
            process.exit(0);
        }

        const useDownloadSequence = files.length > 1;
        const fileDownloads = await Promise.all(
            files.map(async (file) => {
                const isDirectory = saveLocation && await downloadToDirectory(saveLocation);
                const directory = isDirectory ? saveLocation : await findDownloadDir(findFileName(file));
                const fileName = isDirectory || !saveLocation ? "" : path.basename(saveLocation);

                return await downloadFile({
                    url: file,
                    directory,
                    fileName,
                    truncateName,
                    cliProgress: !useDownloadSequence,
                    cliStyle: "fancy",
                    parallelStreams: Number(number) || 4
                });
            })
        );

        if (fileDownloads.length === 1)
            await fileDownloads[0].download();
        else {
            const downloader = await downloadSequence({
                truncateName,
                cliProgress: true,
                cliStyle: "fancy"
            }, ...fileDownloads);
            await downloader.download();
        }
    })
    .version(packageJson.version);

pullCommand.addCommand(setCommand);
pullCommand.parse();
