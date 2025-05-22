import {promiseWithResolvers} from "./retry-async-statement.js";
import SmartChunkSplit from "./smart-chunk-split.js";
import BaseDownloadEngineFetchStream from "../base-download-engine-fetch-stream.js";

type IStreamResponse = {
    on(event: "data", listener: (chunk: Uint8Array) => void): IStreamResponse;
    on(event: "close", listener: () => void): IStreamResponse;
    on(event: "error", listener: (error: Error) => void): IStreamResponse;
    pause(): void;
    resume(): void;
    destroy(): void;
};

export default async function streamResponse(stream: IStreamResponse, downloadEngine: BaseDownloadEngineFetchStream, smartSplit: SmartChunkSplit, onProgress?: (leftOverLength: number) => void): Promise<void> {
    const {promise, resolve, reject} = promiseWithResolvers();

    stream.on("data", (chunk) => {
        smartSplit.addChunk(chunk);
        onProgress?.(smartSplit.savedLength);
    });

    stream.on("close", () => {
        smartSplit.closeAndSendLeftoversIfLengthIsUnknown();
        resolve();
    });

    stream.on("error", (error) => {
        reject(error);
    });

    const pause = stream.pause.bind(stream);
    const resume = stream.resume.bind(stream);
    const close = stream.destroy.bind(stream);

    downloadEngine.on("paused", pause);
    downloadEngine.on("resumed", resume);
    downloadEngine.on("aborted", close);

    try {
        await promise;
    } finally {
        downloadEngine.off("paused", pause);
        downloadEngine.off("resumed", resume);
        downloadEngine.off("aborted", close);
        stream.destroy();
    }
}
