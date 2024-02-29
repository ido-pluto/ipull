export type SmartChunkSplitOptions = {
    chunkSize: number;
};

export default class SmartChunkSplit {
    private readonly _callback: (data: Uint8Array, index: number) => void;
    private readonly _options: SmartChunkSplitOptions;
    private _counter: number = 0;
    private _chunk: Uint8Array = new Uint8Array(0);

    public constructor(_callback: (data: Uint8Array, index: number) => void, _options: SmartChunkSplitOptions) {
        this._options = _options;
        this._callback = _callback;
    }


    public addChunk(data: Uint8Array) {
        const oldData = this._chunk;
        this._chunk = new Uint8Array(oldData.length + data.length);
        this._chunk.set(oldData);
        this._chunk.set(data, oldData.length);

        this._sendChunk();
    }

    public get leftOverLength() {
        return this._chunk.length;
    }

    public sendLeftovers() {
        if (this._chunk.length > 0) {
            this._callback(this._chunk, this._counter++);
        }
    }

    private _sendChunk() {
        while (this._chunk.length >= this._options.chunkSize) {
            const chunk = this._chunk.slice(0, this._options.chunkSize);
            this._chunk = this._chunk.slice(this._options.chunkSize);
            this._callback(chunk, this._counter++);
        }
    }
}
