#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import yargs, {ArgumentsCamelCase, Argv} from "yargs";
import {hideBin} from "yargs/helpers";
import {packageJson} from "../const.js";
import {downloadFile, downloadSequence} from "../download/node-download.js";
import {AvailablePrograms} from "../download/download-engine/download-file/download-programs/switch-program.js";
import {AvailableCLIProgressStyle} from "../download/transfer-visualize/transfer-cli/progress-bars/switch-cli-progress-style.js";
import {setCommand} from "./commands/set.js";
import findDownloadDir, {findFileName} from "./utils/find-download-dir.js";

const CLI_PROGRESS_STYLES = ["basic", "fancy", "ci", "summary"] as const satisfies readonly AvailableCLIProgressStyle[];
const DOWNLOAD_PROGRAMS = ["stream", "chunks"] as const satisfies readonly AvailablePrograms[];

type PullCommandArgs = {
    files: string[];
    save?: string;
    connections: number;
    style?: AvailableCLIProgressStyle;
    program?: AvailablePrograms;
    truncateName?: boolean;
    maxSpeed?: number;
};

async function pullFiles({
    files,
    save: saveLocation,
    truncateName,
    connections,
    program,
    style,
    maxSpeed
}: ArgumentsCamelCase<PullCommandArgs>) {
    if (files.length === 0) {
        yargsInstance.showHelp();
        process.exit(0);
    }

    let saveLocationIsDirectory = false;
    if (saveLocation) {
        try {
            const stat = await fs.lstat(saveLocation);
            saveLocationIsDirectory = stat.isDirectory();
        } catch {
            saveLocationIsDirectory = /[\\/]\s*$/.test(saveLocation);
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
                parallelStreams: connections,
                programType: program,
                maxDownloadSpeed: maxSpeed
            });
        })
    );

    const downloader = await downloadSequence({
        truncateName,
        cliProgress: true,
        cliStyle: style
    }, ...fileDownloads);
    await downloader.download();
}

function buildPullCommand<T>(parser: Argv<T>) {
    return parser
        .positional("files", {
            describe: "Files to pull/copy",
            type: "string",
            array: true,
            default: []
        })
        .option("save", {
            alias: "s",
            describe: "Save location (directory/file)",
            type: "string"
        })
        .option("connections", {
            alias: "c",
            describe: "Number of parallel connections",
            type: "number",
            default: 4
        })
        .option("style", {
            alias: "st",
            describe: "The style of the CLI progress bar",
            choices: CLI_PROGRESS_STYLES
        })
        .option("program", {
            alias: "p",
            describe: "The download strategy",
            choices: DOWNLOAD_PROGRAMS
        })
        .option("truncate-name", {
            alias: "t",
            describe: "Truncate file names in the CLI status to make them appear shorter",
            type: "boolean"
        })
        .option("max-speed", {
            alias: "ms",
            describe: "Maximum download speed per file in bytes per second",
            type: "number"
        });
}

const yargsInstance = yargs(hideBin(process.argv))
    .scriptName("ipull")
    .version(packageJson.version)
    .usage("$0 [files...]")
    .command<PullCommandArgs>(
        "$0 [files..]",
        "Pull/copy files from remote server/local directory",
        buildPullCommand,
        pullFiles
    )
    .command(setCommand)
    .strict()
    .help();

await yargsInstance.parseAsync();
