import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        pool: "threads",
        testTimeout: 1000 * 60 * 3
    }
});
