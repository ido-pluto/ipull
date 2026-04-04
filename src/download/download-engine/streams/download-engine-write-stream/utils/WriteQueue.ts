import {FileHandle} from "fs/promises";
import WriterIsClosedError from "../errors/writer-is-closed-error.js";

const MIN_BUFFER_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_BUFFER_SIZE = 64 * 1024 * 1024; // 64 MB
const ADAPTIVE_PERCENT = 0.05;

export type WriteQueueOptions = {
    writeBufferMaxBytes?: number;
    flushMetadata: () => Promise<void>;
    getFd: () => Promise<FileHandle> | FileHandle;
};

type PendingRegion = {
    cursor: number;
    buffers: Uint8Array[];
    length: number;
};

/**
 * High-performance write buffer that coalesces contiguous writes
 * and flushes them as parallel positional writes to the file descriptor.
 *
 * Design principles:
 * - No locks — parallel positional writes (`fd.write` with offset) are safe for non-overlapping regions
 * - Contiguous buffer merging — sequential writes from the same stream are combined
 * - Adaptive threshold — flush size scales with file size (5%, min 2MB, max 64MB)
 * - Data-driven flushes — threshold exceeded → immediate flush
 * - Explicit drain on pause/close/truncate — no timers needed
 */
export default class WriteQueue {
    private _options: WriteQueueOptions;
    private _regions: PendingRegion[] = [];
    private _totalBuffered = 0;
    private _maxBufferedBytes: number = MIN_BUFFER_SIZE;
    private _inFlightWrites = new Set<Promise<void>>();
    private _closed = false;

    constructor(options: WriteQueueOptions) {
        this._options = options;

        if (options?.writeBufferMaxBytes) {
            this._maxBufferedBytes = options.writeBufferMaxBytes;
        }
    }

    setFileSize(fileSize: number) {
        if (this._options?.writeBufferMaxBytes) return;

        this._maxBufferedBytes = Math.min(
            Math.max(fileSize * ADAPTIVE_PERCENT, MIN_BUFFER_SIZE),
            MAX_BUFFER_SIZE
        );
    }

    /**
     * Buffer a write. Concatenates fragments into a single Buffer,
     * merges with adjacent regions, and flushes when threshold is exceeded.
     */
    addWrite(cursor: number, buffers: Uint8Array[]): void | Promise<void> {
        if (this._closed) {
            throw new WriterIsClosedError("Cannot add write to closed WriteQueue");
        }

        const length = buffers.reduce((sum, buf) => sum + buf.length, 0);

        const merged = this._tryMerge(cursor, buffers, length);
        if (!merged) {
            this._regions.push({cursor, buffers, length});
        }

        this._totalBuffered += length;
        if (this._inFlightWrites.size === 0 && this._totalBuffered >= this._maxBufferedBytes) {
            return this._flushNow();
        }
    }

    /**
     * Try to merge the new buffer with an existing region if contiguous.
     */
    private _tryMerge(cursor: number, buffers: Uint8Array[], length: number): boolean {
        for (let i = 0; i < this._regions.length; i++) {
            const region = this._regions[i];
            const regionEnd = region.cursor + region.length;

            if (cursor === regionEnd) {
                region.buffers.push(...buffers);
                region.length += length;
            } else if (cursor + length === region.cursor) {
                region.cursor = cursor;
                region.buffers.unshift(...buffers);
                region.length += length;
            } else {
                continue;
            }

            if (this._tryMerge(region.cursor, region.buffers, region.length)) {
                this._regions.splice(i, 1);
            }
        }

        return false;
    }

    /**
     * Flush all buffered regions to disk as parallel positional writes.
     * Non-overlapping positional writes via fd.write(buf, 0, len, position) are safe concurrently.
     */
    private _flushNow(flushMetadata = true, flashAll = false): void | Promise<void> {
        if (this._regions.length === 0) return;

        const regionsToFlush = this._regions;
        this._regions = [];
        this._totalBuffered = 0;

        const flushPromise = this._doFlush(regionsToFlush, flushMetadata)
            .finally(() => this._inFlightWrites.delete(flushPromise));

        this._inFlightWrites.add(flushPromise);

        return flushPromise.then(async () => {
            if (this._inFlightWrites.size > 0) {
                await this._waitForInFlight();
            }

            if (this._totalBuffered >= this._maxBufferedBytes || flashAll && this._regions.length > 0) {
                return this._flushNow(flushMetadata, flashAll);
            }
        });
    }

    private async _doFlush(regions: PendingRegion[], flushMetadata = true): Promise<void> {
        const fdResult = this._options.getFd();
        const fd = fdResult instanceof Promise ? await fdResult : fdResult;

        // Write all non-overlapping regions in parallel
        const writes: Promise<any>[] = regions.map(region =>
            fd.writev(region.buffers, region.cursor)
        );

        await Promise.all(writes);

        if (flushMetadata) {
            await this._options.flushMetadata();
        }
    }

    /**
     * Flush all buffered data and wait for all in-flight writes to complete, after it flushes metadata.
     * Called by ensureBytesSynced(), close(), ftruncate().
     */
    async drain(): Promise<void> {
        if (this._inFlightWrites.size > 0) {
            await this._waitForInFlight();
        }

        await this._flushNow(false, true);
        await this._options.flushMetadata();
    }

    private async _waitForInFlight(): Promise<void> {
        while (this._inFlightWrites.size > 0) {
            await Promise.all(this._inFlightWrites);
        }
    }

    close() {
        this._closed = true;
    }

    get bufferedBytes(): number {
        return this._totalBuffered;
    }

    get pendingRegions(): number {
        return this._regions.length;
    }

    get inFlightCount(): number {
        return this._inFlightWrites.size;
    }
}
