export default abstract class BaseDownloadEngineWriteStream {
    abstract write(cursor: number, buffers: Uint8Array[]): Promise<void> | void;

    close(): void | Promise<void> {
    }
}
