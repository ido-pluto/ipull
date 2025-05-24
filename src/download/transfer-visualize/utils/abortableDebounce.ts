/**
 * Creates a debounced function that can be aborted using an AbortSignal.
 * The function will execute after a specified wait time, but can also execute immediately
 * if the maximum wait time is reached since the last call.
 *
 * @param func - The function to debounce.
 * @param options - Options for the debounce behavior.
 * @returns A debounced version of the provided function.
 */
type AbortableDebounceOptions = {
    maxWait?: number; // Maximum wait time in milliseconds
    wait?: number; // Wait time in milliseconds
    signal?: AbortSignal; // Abort signal to cancel the debounce
};

export function abortableDebounce<T extends (...args: any[]) => void>(func: T, {wait = 0, maxWait = wait, signal}: AbortableDebounceOptions): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastCallTime = 0;

    signal?.addEventListener("abort", () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    });

    return (...args: Parameters<T>) => {
        const now = Date.now();

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (signal?.aborted) {
            return; // If the signal is aborted, do nothing
        }

        const timeSinceLastCall = now - lastCallTime;

        if (timeSinceLastCall >= maxWait) {
            func(...args);
            lastCallTime = now;
        } else {
            timeoutId = setTimeout(() => {
                func(...args);
                lastCallTime = Date.now();
            }, Math.max(wait - timeSinceLastCall, 0));
        }
    };
}
