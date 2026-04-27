import {afterEach, describe, expect, test, vi} from "vitest";
import ByteRateLimiter from "../src/download/download-engine/streams/download-engine-fetch-stream/utils/byte-rate-limiter.js";

afterEach(() => {
    vi.useRealTimers();
});

describe("ByteRateLimiter", () => {
    test("waits for one piece larger than the allowed burst", async () => {
        vi.useFakeTimers();

        const limiter = new ByteRateLimiter(100, 0.5);
        let resolved = false;
        const wait = Promise.resolve(limiter.waitFor(100)).then(() => {
            resolved = true;
        });

        await vi.advanceTimersByTimeAsync(499);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await wait;
        expect(resolved).toBe(true);
    });

    test("queues concurrent waits against the same byte budget", async () => {
        vi.useFakeTimers();

        const limiter = new ByteRateLimiter(100, 0);
        let firstResolved = false;
        let secondResolved = false;

        const firstWait = Promise.resolve(limiter.waitFor(100)).then(() => {
            firstResolved = true;
        });
        const secondWait = Promise.resolve(limiter.waitFor(100)).then(() => {
            secondResolved = true;
        });

        await vi.advanceTimersByTimeAsync(999);
        expect(firstResolved).toBe(false);
        expect(secondResolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await firstWait;
        expect(firstResolved).toBe(true);
        expect(secondResolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1000);
        await secondWait;
        expect(secondResolved).toBe(true);
    });
});
