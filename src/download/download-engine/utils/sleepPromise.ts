export function sleepPromise(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}
