#!/usr/bin/env node
import path from "path";
import {Command, Option} from "commander";
import {packageJson} from "../const.js";
import {downloadFile, downloadSequence} from "../download/node-download.js";
import {setCommand} from "./commands/set.js";
import findDownloadDir, {findFileName} from "./utils/find-download-dir.js";
import {AvailableCLIProgressStyle} from "../download/transfer-visualize/transfer-cli/progress-bars/switch-cli-progress-style.js";
import fs from "fs/promises";

const pullCommand = new Command();
pullCommand
    .description("Pull/copy files from remote server/local directory")
    .argument("[files...]", "Files to pull/copy")
    .option("-s --save [path]", "Save location (directory/file)")
    .option("-c --connections [number]", "Number of parallel connections", "4")
    .addOption(new Option("--style [type]", "The style of the CLI progress bar").choices(["basic", "fancy", "ci", "summary"]))
    .addOption(new Option("-p --program [type]", "The download strategy").choices(["stream", "chunks"]))
    .option("-t --truncate-name", "Truncate file names in the CLI status to make them appear shorter")
    .action(async (files: string[] = [], {save: saveLocation, truncateName, number, program, style}: {
        save?: string,
        truncateName?: boolean,
        number: string,
        program: string,
        style: AvailableCLIProgressStyle
    }) => {
        if (files.length === 0) {
            pullCommand.outputHelp();
            process.exit(0);
        }

        let saveLocationIsDirectory = false;
        if (saveLocation) {
            try {
                const stat = await fs.lstat(saveLocation);
                saveLocationIsDirectory = stat.isDirectory();
            } catch {
                saveLocationIsDirectory = saveLocation.endsWith(path.sep);
            }
        }

        const fileDownloads = await Promise.all(
            files.map(async (file, index) => {

                let fileName: string | undefined;
                let directory = await findDownloadDir(findFileName(file));

                if (saveLocation) {
                    if (saveLocationIsDirectory) {
                        directory = saveLocation;
                    } else {
                        directory = path.dirname(saveLocation);

                        const basename = path.basename(saveLocation);
                        const fileIndex = files.length > 1 ? ((index + 1) + "-") : "";
                        fileName = fileIndex + basename;
                    }
                }

                return await downloadFile({
                    url: file,
                    directory,
                    fileName,
                    truncateName,
                    parallelStreams: Number(number) || 4,
                    programType: program as any
                });
            })
        );

        const downloader = await downloadSequence({
            truncateName,
            cliProgress: true,
            cliStyle: style
        }, ...fileDownloads);
        await downloader.download();
    })
    .version(packageJson.version);

pullCommand.addCommand(setCommand);
pullCommand.parse();
