import {WriteCallback} from "../base-download-engine-fetch-stream.js";

export type SmartChunkSplitOptions = {
    chunkSize: number;
    startChunk: number;
};

export default class SmartChunkSplit {
    private readonly _callback: WriteCallback;
    private readonly _options: SmartChunkSplitOptions;
    private _bytesWriteLocation: number;
    private _bytesLeftovers: number = 0;
    private _chunks: Uint8Array[] = [];

    public constructor(_callback: WriteCallback, _options: SmartChunkSplitOptions) {
        this._options = _options;
        this._callback = _callback;
        this._bytesWriteLocation = _options.startChunk * _options.chunkSize;
    }

    public addChunk(data: Uint8Array) {
        this._chunks.push(data);
        this._sendChunk();
    }

    public get savedLength() {
        return this._bytesLeftovers + this._chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    }

    public sendLeftovers() {
        if (this.savedLength >= this._options.chunkSize) {
            this._callback(this._chunks, this._bytesWriteLocation, this._options.startChunk++);
        }
    }

    private _sendChunk() {
        while (this.savedLength >= this._options.chunkSize) {
            if (this._chunks.length === 0) {
                this._callback([], this._bytesWriteLocation, this._options.startChunk++);
                this._bytesWriteLocation += this._options.chunkSize;
                this._bytesLeftovers -= this._options.chunkSize;
            }

            let sendLength = this._bytesLeftovers;
            for (let i = 0; i < this._chunks.length; i++) {
                sendLength += this._chunks[i].byteLength;
                if (sendLength >= this._options.chunkSize) {
                    this._callback(this._chunks.splice(0, i + 1), this._bytesWriteLocation, this._options.startChunk++);
                    this._bytesWriteLocation += sendLength - this._bytesLeftovers;
                    this._bytesLeftovers = sendLength - this._options.chunkSize;
                    break;
                }
            }
        }
    }
}
