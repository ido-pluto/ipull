import {CommandModule} from "yargs";
import {AppDB} from "../../settings/settings.js";

type SetCommandArgs = {
    extension: string;
    path?: string;
    delete?: boolean;
};

const HELP_TEXT =
    `
You can set that file extensions will be download to specific path.
For example all zip files will be download to ~/Downloads/zip/:
pull set .zip ~/Downloads/zip/

You can set default download path:
pull set default ~/Downloads/
 `;

export const setCommand: CommandModule<object, SetCommandArgs> = {
    command: "set <file extension> [path]",
    describe: "Set download locations",
    builder: yargs => yargs
        .positional("extension", {
            describe: "File extension to set the download path for (e.g. .zip, .jpg, default)",
            type: "string",
            demandOption: true
        })
        .positional("path", {
            describe: "Path to set for the specified file extension",
            type: "string",
        })
        .option("delete", {
            alias: "d",
            describe: "Delete the setting",
            type: "boolean"
        })
        .check(({ path, delete: deleteSetting}) => {
            if (!deleteSetting && typeof path !== "string") {
                throw new Error("path is required unless --delete is used");
            }

            return true;
        })
        .epilog(HELP_TEXT),
    handler: async ({extension, path, delete: deleteSetting}) => {
        if (deleteSetting) {
            await AppDB.update(data => {
                delete data[extension];
            });

            console.log(`Deleted ${extension} setting`);
            return;
        }

        await AppDB.update(data => {
            data[extension] = path!;
        });
        console.log(`${extension} set to ${path}`);
    }
};
