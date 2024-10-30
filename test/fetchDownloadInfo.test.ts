import {beforeAll, describe, test} from "vitest";
import express from "express";
import {downloadFile} from "../src/index.js";
import {packageJson} from "../src/const.js";

describe("Fetch download info", () => {
    beforeAll(async () => {
        const server = express();
        server.get("/file.json", (req, res) => {
            res.json(packageJson);
        });

        await new Promise<void>(resolve => {
            console.log("File Server Listening on 3000");
            server.listen(3000, resolve);
        });
    });

    test("Fetch download info GET", async (context) => {
        const downloader = await downloadFile({
            url: "http://localhost:3000/file.json",
            directory: "."
        });

        context.expect(downloader.file.totalSize > 0)
            .toBeTruthy();
    });
}, {timeout: 0});
