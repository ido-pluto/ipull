#!/usr/bin/env node

import path from "path";
import {pathToFileURL} from "url";
import {Command} from "commander";
import {packageJson} from "../const.js";
import pullFileCLI from "../download/index.js";
import {truncateText} from "../utils/truncate-text.js";
import {FastDownload} from "../index.js";
import findDownloadDir from "./utils/find-download-dir.js";
import {setCommand} from "./commands/set.js";


const pullCommand = new Command();
pullCommand
    .version(packageJson.version)
    .description("Pull/copy files from remote server/local directory")
    .argument("[files...]", "Files to pull/copy")
    .option("-s --save [path]", "Save directory")
    .option("-n --name [name]", "Downloaded file name")
    .option("-f --full-name", "Show full name of the file while downloading, even if it long")
    .action(async (files: string[] = [], {save, fullName, name}: { save?: string, fullName?: boolean, name?: string }) => {
        if (files.length === 0) {
            pullCommand.outputHelp();
            process.exit(0);
        }

        const pullLogs: string[] = [];
        for (const [index, file ] of Object.entries(files)) {
            let fileName = path.basename(file);

            if (name) {
                fileName = files.length > 1 ? name + index : name;
            } else if (file.startsWith("http")) {
                fileName = await FastDownload.fetchFilename(file);
            }

            const downloadTag = fullName ? fileName : truncateText(fileName);
            const downloadPath = path.join(save || await findDownloadDir(fileName), fileName);
            const fileFullPath = new URL(file, pathToFileURL(process.cwd()));
            await pullFileCLI(fileFullPath.href, downloadPath, downloadTag);
            pullLogs.push(`${fileFullPath.href} -> ${downloadPath}`);
        }

        console.log();
        console.log(pullLogs.join("\n"));
        process.exit(0);
    });

pullCommand.addCommand(setCommand);
pullCommand.parse();
