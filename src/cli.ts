#!/usr/bin/env node

import {Command} from "commander";
import {packageJson} from "./const.js";
import pullFileCLI from "./download/index.js";
import path from "path";
import {truncateText} from "./utils/truncate-text.js";

const pullCommand = new Command();
pullCommand
    .version(packageJson.version)
    .description("Pull/copy files from remote server/local directory")
    .argument("[files...]", "Files to pull/copy")
    .option("-s --save [path]", "Save directory")
    .option("-f --full-name", "Show full name of the file while downloading, even if it long")
    .action(async (files = [], {save = process.cwd(), fullName}) => {
        for (const file of files) {
            const fileName = path.basename(file);
            const downloadTag = fullName ? fileName : truncateText(fileName);
            await pullFileCLI(file, path.join(save, fileName), downloadTag);
        }

        console.log(`${files.length} files pulled to ${save}`);
    });

pullCommand.parse();
