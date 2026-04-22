export default abstract class BaseDownloadEngineWriteStream {
    abstract write(cursor: number, buffers: Uint8Array[], totalLength: number): Promise<void> | void;

    close(): void | Promise<void> {
    }
}
