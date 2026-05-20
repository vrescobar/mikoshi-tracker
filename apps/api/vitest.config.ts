import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/helpers/global-setup.ts"],
    fileParallelism: true,
    // forks = child processes: each test file gets an isolated Node.js instance.
    // This prevents the libsql native bindings from sharing global state across
    // parallel workers, which causes intermittent "no such table" failures when
    // running with the default 'threads' pool.
    pool: "forks",
    testTimeout: 30000,
  },
});
