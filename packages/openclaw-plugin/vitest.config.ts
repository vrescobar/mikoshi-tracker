import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/helpers/global-setup.ts"],
    pool: "forks",
    testTimeout: 60000,
    hookTimeout: 30000,
  },
});
