import {WriteCallback} from "../base-download-engine-fetch-stream.js";

export type SmartChunkSplitOptions = {
    chunkSize: number;
    startChunk: number;
    endChunk: number;
    lastChunkEndsFile: boolean;
    activePart: {
        size: number;
    }
};

export default class SmartChunkSplit {
    private readonly _callback: WriteCallback;
    private readonly _options: SmartChunkSplitOptions;
    private readonly _lastChunkSize: number;
    private _bytesWriteLocation: number;
    private _chunks: Uint8Array[] = [];
    private _closed = false;

    public constructor(_callback: WriteCallback, _options: SmartChunkSplitOptions) {
        this._options = _options;
        this._callback = _callback;
        this._bytesWriteLocation = _options.startChunk * _options.chunkSize;
        this._lastChunkSize = _options.lastChunkEndsFile ?
            this.calcLastChunkSize() : this._options.chunkSize;
    }

    public calcLastChunkSize() {
        return this._options.activePart.size - Math.max(this._options.endChunk - 1, 0) * this._options.chunkSize;
    }

    public addChunk(data: Uint8Array) {
        this._chunks.push(data);
        this._sendChunk();
    }

    public get savedLength() {
        return this._chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    }

    closeAndSendLeftoversIfLengthIsUnknown() {
        if (this._chunks.length > 0 && this._options.endChunk === Infinity) {
            this._callback(this._chunks, this._bytesWriteLocation, this._options.startChunk++);
        }
        this._closed = true;
    }

    private _sendChunk() {
        if (this._closed) return;

        const checkThreshold = () =>
            (this._options.endChunk - this._options.startChunk === 1 ?
                this._lastChunkSize : this._options.chunkSize);

        let calcChunkThreshold = 0;
        while (this.savedLength >= (calcChunkThreshold = checkThreshold())) {
            let sendLength = 0;
            for (let i = 0; i < this._chunks.length; i++) {
                const currentChunk = this._chunks[i];
                sendLength += currentChunk.length;
                if (sendLength >= calcChunkThreshold) {
                    const sendChunks = this._chunks.splice(0, i + 1);
                    const diffLength = sendLength - calcChunkThreshold;

                    if (diffLength > 0) {
                        const lastChunkEnd = currentChunk.length - diffLength;
                        const lastChunk = currentChunk.subarray(0, lastChunkEnd);

                        sendChunks.pop();
                        sendChunks.push(lastChunk);

                        this._chunks.unshift(currentChunk.subarray(lastChunkEnd));
                    }

                    this._callback(sendChunks, this._bytesWriteLocation, this._options.startChunk++);
                    this._bytesWriteLocation += calcChunkThreshold;
                    break;
                }
            }
        }
    }
}
