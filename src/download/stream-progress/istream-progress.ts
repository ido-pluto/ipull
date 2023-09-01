export abstract class IStreamProgress {
    abstract init(): Promise<void>;

    abstract progress(callback: (progressBytes: number, totalBytes: number) => void): Promise<any>;
}
