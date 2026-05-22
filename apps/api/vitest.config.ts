import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/helpers/global-setup.ts"],
    fileParallelism: true,
    // forks = child processes: separate Node.js instances per worker. This keeps
    // the libsql native bindings from sharing global state across parallel
    // workers, which causes intermittent "no such table" failures under the
    // default 'threads' pool.
    pool: "forks",
    poolOptions: {
      forks: {
        // isolate: false reuses each worker process across the test files it
        // runs, so the heavy module graph (Prisma client, Fastify, better-auth)
        // is loaded once per worker instead of once per file. Each test still
        // gets a fresh on-disk SQLite DB via createTestContext, so DB state stays
        // isolated. Big win on the slow ARM host where module init dominates.
        isolate: false,
      },
    },
    testTimeout: 30000,
  },
});
