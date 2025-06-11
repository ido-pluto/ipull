import {beforeAll, describe, test} from "vitest";
import express from "express";
import {downloadFile} from "../src/index.js";
import {packageJson} from "../src/const.js";
import fsPromise from "fs/promises";
import {Throttle} from "stream-throttle";
import {Readable} from "node:stream";

const TEMP_MODEL_TO_DOWNLOAD = "https://huggingface.co/mradermacher/arwkv-qwen-r1-1b5-i1-GGUF/resolve/main/arwkv-qwen-r1-1b5.i1-IQ1_M.gguf?download=true";
const MAX_SPEED_BYTES = 5 * 1024 * 1024; // 5 MB/s

describe("Fetch download info", () => {
    beforeAll(async () => {
        const server = express();
        server.get("/file.json", (req, res) => {
            res.json(packageJson);
        });

        server.get("/fileCreateToken.gguf", (req, res) => {
            res.redirect(`/file.gguf?token=${Date.now() + 1000 * 3}`);
        });

        server.get("/file.gguf", async (req, res) => {
            const token = req.query.token as string;
            if (!token || Date.now() > parseInt(token)) {
                res.status(403)
                    .send("Token expired");
                return;
            }

            // proxy to huggingface model with throttling
            const throttledStream = new Throttle({
                rate: MAX_SPEED_BYTES // 5 MB/s
            });

            const response = await fetch(TEMP_MODEL_TO_DOWNLOAD, {
                headers: {
                    range: req.header("range")!
                }
            });

            if (!response.ok) {
                res.status(response.status)
                    .send("Error fetching file");
                return;
            }
            res.setHeader("Content-Type", "application/octet-stream");
            res.setHeader("Content-Disposition", `attachment; filename="file.gguf"`);
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Content-Length", response.headers.get("Content-Length") || "0");
            Readable.fromWeb(response.body as any)
                .pipe(throttledStream)
                .pipe(res)
                .on("error", (err) => {
                    console.error("Error piping response:", err);
                    res.status(500)
                        .send("Internal Server Error");
                });
        });

        await new Promise<void>(resolve => {
            console.log("File Server Listening on 3000");
            server.listen(3000, resolve);
        });
    }, 0);

    test("Fetch download info GET", async (context) => {
        const downloader = await downloadFile({
            url: "http://localhost:3000/file.json",
            directory: "."
        });

        context.expect(downloader.file.totalSize > 0)
            .toBeTruthy();
    });

    test("Refetch download info when token is expired", async (context) => {
        const downloader = await downloadFile({
            url: "http://localhost:3000/fileCreateToken.gguf",
            directory: ".",
            programType: "chunks",
            parallelStreams: 3
        });

        await downloader.download();
        const fileSize = (await fsPromise.stat(downloader.finalFileAbsolutePath)).size;
        context.expect(fileSize)
            .toMatchInlineSnapshot(`599171040`);
    });
}, {timeout: 0});
