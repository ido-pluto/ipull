export function abortableSleep(timeMS: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            resolve();
        }, timeMS);

        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(timeoutId);
                resolve();
            }, {once: true});
        }
    });
}
