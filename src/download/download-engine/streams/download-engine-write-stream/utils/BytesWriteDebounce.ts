import sleep from "sleep-promise";

export type BytesWriteDebounceOptions = {
    maxTime: number;
    maxSize: number;
    writev: (index: number, buffers: Uint8Array[]) => Promise<void>;
};

export class BytesWriteDebounce {
    private _writeChunks: {
        index: number;
        buffer: Uint8Array;
    }[] = [];
    private _lastWriteTime = Date.now();
    private _totalSizeOfChunks = 0;
    private _checkWriteInterval = false;

    constructor(private _options: BytesWriteDebounceOptions) {

    }

    async addChunk(index: number, buffer: Uint8Array) {
        this._writeChunks.push({index, buffer});
        this._totalSizeOfChunks += buffer.byteLength;

        await this._writeIfNeeded();
        this.checkIfWriteNeededInterval();
    }

    private async _writeIfNeeded() {
        if (this._totalSizeOfChunks >= this._options.maxSize || Date.now() - this._lastWriteTime >= this._options.maxTime) {
            await this.writeAll();
        }
    }

    private async checkIfWriteNeededInterval() {
        if (this._checkWriteInterval) {
            return;
        }
        this._checkWriteInterval = true;

        while (this._writeChunks.length > 0) {
            await this._writeIfNeeded();
            const timeUntilMaxLimitAfterWrite = this._options.maxTime - (Date.now() - this._lastWriteTime);
            await sleep(Math.max(timeUntilMaxLimitAfterWrite, 0));
        }

        this._checkWriteInterval = false;
    }

    writeAll() {
        if (this._writeChunks.length === 0) {
            return;
        }

        this._writeChunks = this._writeChunks.sort((a, b) => a.index - b.index);
        const firstWrite = this._writeChunks[0];

        let writeIndex = firstWrite.index;
        let buffer: Uint8Array[] = [firstWrite.buffer];
        let bufferTotalLength = firstWrite.buffer.length;

        const writePromises: Promise<void>[] = [];

        for (let i = 0; i < this._writeChunks.length; i++) {
            const nextWriteLocation = writeIndex + bufferTotalLength;
            const currentWrite = this._writeChunks[i];

            if (currentWrite.index < nextWriteLocation) { // overlapping, prefer the last buffer (newer data)
                const lastBuffer = buffer.pop()!;
                buffer.push(currentWrite.buffer);
                bufferTotalLength += currentWrite.buffer.length - lastBuffer.length;
            } else if (nextWriteLocation === currentWrite.index) {
                buffer.push(currentWrite.buffer);
                bufferTotalLength += currentWrite.buffer.length;
            } else {
                writePromises.push(this._options.writev(writeIndex, buffer));

                writeIndex = currentWrite.index;
                buffer = [currentWrite.buffer];
                bufferTotalLength = currentWrite.buffer.length;
            }
        }

        writePromises.push(this._options.writev(writeIndex, buffer));

        this._writeChunks = [];
        this._totalSizeOfChunks = 0;
        this._lastWriteTime = Date.now();
        return Promise.all(writePromises);
    }
}
