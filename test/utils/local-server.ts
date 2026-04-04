import express from "express";
import http from "http";

export const TEST_FILE_SIZE = 8 * 1024 * 1024; // 8MB
export const TEST_FILE_DATA = Buffer.alloc(TEST_FILE_SIZE, 0x61); // 'a' bytes

export type LocalTestServer = {
    baseURL: string;
    close: () => Promise<void>;
};

const parseRange = (rangeHeader: string | undefined) => {
    if (!rangeHeader) return null;
    const match = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
    if (!match) return null;

    const start = Number(match[1]);
    const end = typeof match[2] === "undefined" ? TEST_FILE_SIZE - 1 : Number(match[2]);
    return {start, end};
};

const setCommonHeaders = (res: express.Response, withRange: boolean, length: number) => {
    if (withRange) {
        res.setHeader("Accept-Ranges", "bytes");
    }
    res.setHeader("Content-Length", String(length));
};

const handleRangeRequest = (req: express.Request, res: express.Response, data: Buffer) => {
    const rangeHeader = req.header("range");
    if (!rangeHeader) {
        setCommonHeaders(res, true, TEST_FILE_SIZE);
        res.status(200).send(data);
        return;
    }

    const range = parseRange(rangeHeader);
    if (!range || range.start > range.end || range.start < 0 || range.end >= TEST_FILE_SIZE) {
        res.status(416).end();
        return;
    }

    const chunk = data.slice(range.start, range.end + 1);
    res.status(206);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${TEST_FILE_SIZE}`);
    res.setHeader("Content-Length", String(chunk.length));
    res.send(chunk);
};

const setupRangeFileRoutes = (app: express.Express) => {
    app.head("/range-file.bin", (req, res) => {
        setCommonHeaders(res, true, TEST_FILE_SIZE);
        res.status(200).end();
    });

    app.get("/range-file.bin", (req, res) => {
        handleRangeRequest(req, res, TEST_FILE_DATA);
    });
};

const setupNoRangeRoutes = (app: express.Express) => {
    app.head("/no-range-file.png", (req, res) => {
        setCommonHeaders(res, false, TEST_FILE_SIZE);
        res.status(200).end();
    });

    app.get("/no-range-file.png", (req, res) => {
        setCommonHeaders(res, false, TEST_FILE_SIZE);
        res.status(200).send(TEST_FILE_DATA);
    });

    app.head("/no-range-zero.png", (req, res) => {
        res.setHeader("Content-Length", "0");
        res.status(200).end();
    });

    app.get("/no-range-zero.png", (req, res) => {
        res.setHeader("Content-Length", "0");
        res.status(200).send(TEST_FILE_DATA);
    });
};

const setupMismatchRoutes = (app: express.Express) => {
    app.head("/bad-content-range.bin", (req, res) => {
        setCommonHeaders(res, true, TEST_FILE_SIZE);
        res.status(200).end();
    });

    app.get("/bad-content-range.bin", (req, res) => {
        const rangeHeader = req.header("range");
        if (!rangeHeader) {
            setCommonHeaders(res, true, TEST_FILE_SIZE + 1); // wrong length deliberately
            res.status(200).send(TEST_FILE_DATA);
            return;
        }

        const range = parseRange(rangeHeader);
        if (!range || range.start > range.end || range.start < 0 || range.end >= TEST_FILE_SIZE) {
            res.status(416).end();
            return;
        }

        const chunk = TEST_FILE_DATA.slice(range.start, range.end + 1);
        res.status(206);
        res.setHeader("Accept-Ranges", "bytes");
        // intentionally provide mismatched content-range and content-length
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end + 1}/${TEST_FILE_SIZE}`);
        res.setHeader("Content-Length", String(chunk.length));
        res.send(chunk);
    });
};

const setupContentLengthMismatchRoutes = (app: express.Express) => {
    app.head("/bad-length.bin", (req, res) => {
        setCommonHeaders(res, true, TEST_FILE_SIZE);
        res.status(200).end();
    });

    app.get("/bad-length.bin", (req, res) => {
        const rangeHeader = req.header("range");
        if (!rangeHeader) {
            setCommonHeaders(res, true, TEST_FILE_SIZE + 1000); // wrong length deliberately
            res.status(200).send(TEST_FILE_DATA.slice(0, TEST_FILE_SIZE + 1000)); // but send correct data? Wait, to mismatch, send less or more.
            // To mismatch, perhaps send TEST_FILE_DATA, but header wrong.
            // But to make it throw, send TEST_FILE_DATA, header wrong, but in fetch, header wrong, throw.
            // In xhr, data length correct, header wrong, but xhr checks data vs expected, expected from header? No, expected is calculated, data is correct, so no throw.
            // For no range, the expected is the totalSize, contentLength from header.
            // So for no range, if header wrong, in fetch, contentLength !== expected, throw.
            // In xhr, the check is if expected !== arrayBuffer.byteLength, but expected is from header? No, in xhr, expectedContentLength is calculated from range, same as fetch.
            // In xhr, the check is expectedContentLength !== arrayBuffer.byteLength
            // So for no range, expected = total, data length = total, header wrong, but check is data vs expected, not header.
            // So for no range, it won't throw in xhr.
            // For range, in xhr, data length = sent length = chunk.length - 1, expected = chunk.length, throw.
            // For fetch, for range, header = chunk.length - 1, expected = chunk.length, throw.
            // For no range, in fetch, header = TEST_FILE_SIZE + 1000, expected = TEST_FILE_SIZE, throw.
            // In xhr, for no range, data length = TEST_FILE_SIZE, expected = TEST_FILE_SIZE, no throw.
            // So to make it throw in both, for no range, send wrong data length.
            // So set header to TEST_FILE_SIZE + 1000, send TEST_FILE_DATA (length TEST_FILE_SIZE).
            // In fetch, header wrong, throw.
            // In xhr, data length = TEST_FILE_SIZE, expected = TEST_FILE_SIZE + 1000, throw.
            // Yes.
            res.status(200).send(TEST_FILE_DATA);
            return;
        }

        const range = parseRange(rangeHeader);
        if (!range || range.start > range.end || range.start < 0 || range.end >= TEST_FILE_SIZE) {
            res.status(416).end();
            return;
        }

        const chunk = TEST_FILE_DATA.slice(range.start, range.end + 1);
        const wrongChunk = chunk.slice(0, Math.max(0, chunk.length - 1));
        res.status(206);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", String(Math.max(0, chunk.length - 1))); // wrong length
        res.send(wrongChunk);
    });
};

const setupTokenRoutes = (app: express.Express) => {
    let authToken = "";
    app.get("/fileCreateToken.gguf", (req, res) => {
        authToken = String(Date.now() + 1000 * 3);
        res.redirect(`/file.gguf?token=${authToken}`);
    });

    app.get("/file.gguf", (req, res) => {
        const token = String(req.query.token || "");
        if (!token || Number(token) < Date.now()) {
            res.status(403).send("Token expired");
            return;
        }

        handleRangeRequest(req, res, TEST_FILE_DATA);
    });
};

const setupOtherRoutes = (app: express.Express) => {
    app.get("/file.json", (req, res) => {
        res.json({hello: "world", value: 42});
    });
};

export async function startLocalTestServer(): Promise<LocalTestServer> {
    const app = express();

    setupRangeFileRoutes(app);
    setupNoRangeRoutes(app);
    setupMismatchRoutes(app);
    setupContentLengthMismatchRoutes(app);
    setupTokenRoutes(app);
    setupOtherRoutes(app);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve); 
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Failed to start test server");
    }

    const baseURL = `http://127.0.0.1:${address.port}`;

    return {
        baseURL,
        close: async () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    };
}



