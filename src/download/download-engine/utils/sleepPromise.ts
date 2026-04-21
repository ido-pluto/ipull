export function sleepPromise(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}