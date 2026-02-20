import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        pool: "threads",
        maxWorkers: 1,
        testTimeout: 1000 * 60 * 3
    }
});
