import express from "express";
import http from "http";

export const TEST_FILE_SIZE = 8 * 1024 * 1024; // 8MB
export const TEST_FILE_DATA = Buffer.alloc(TEST_FILE_SIZE, 0x61); // 'a' bytes
export const SMALL_TEST_FILE_SIZE = 263181;
export const SMALL_TEST_FILE_DATA = Buffer.alloc(SMALL_TEST_FILE_SIZE, 0x62); // 'b' bytes
export const THROTTLE_TEST_FILE_SIZE = 256 * 1024;
export const THROTTLE_TEST_FILE_DATA = Buffer.alloc(THROTTLE_TEST_FILE_SIZE, 0x63); // 'c' bytes

export type LocalTestServer = {
    baseURL: string;
    close: () => Promise<void>;
};

const parseRange = (rangeHeader: string | undefined, fileSize: number) => {
    if (!rangeHeader) return null;
    const match = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
    if (!match) return null;

    const start = Number(match[1]);
    const end = typeof match[2] === "undefined" ? fileSize - 1 : Number(match[2]);
    return {start, end};
};

const setCommonHeaders = (res: express.Response, withRange: boolean, length: number) => {
    if (withRange) {
        res.setHeader("Accept-Ranges", "bytes");
    }
    res.setHeader("Content-Length", String(length));
};

const handleRangeRequest = (req: express.Request, res: express.Response, data: Buffer) => {
    const fileSize = data.length;
    const rangeHeader = req.header("range");
    if (!rangeHeader) {
        setCommonHeaders(res, true, fileSize);
        res.status(200).send(data);
        return;
    }

    const range = parseRange(rangeHeader, fileSize);
    if (!range || range.start > range.end || range.start < 0 || range.end >= fileSize) {
        res.status(416).end();
        return;
    }

    const chunk = data.slice(range.start, range.end + 1);
    res.status(206);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);
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

    app.head("/throttle-file.bin", (req, res) => {
        setCommonHeaders(res, true, THROTTLE_TEST_FILE_SIZE);
        res.status(200).end();
    });

    app.get("/throttle-file.bin", (req, res) => {
        handleRangeRequest(req, res, THROTTLE_TEST_FILE_DATA);
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

    app.head("/no-range-zero-small.bin", (req, res) => {
        res.setHeader("Content-Length", "0");
        res.status(200).end();
    });

    app.get("/no-range-zero-small.bin", (req, res) => {
        res.setHeader("Content-Length", "0");
        res.status(200).send(SMALL_TEST_FILE_DATA);
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

        const range = parseRange(rangeHeader, TEST_FILE_SIZE);
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
            res.status(200).send(TEST_FILE_DATA.slice(0, TEST_FILE_SIZE + 1000));
            return;
        }

        const range = parseRange(rangeHeader, TEST_FILE_SIZE);
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

