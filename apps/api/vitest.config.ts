import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/helpers/global-setup.ts"],
    fileParallelism: true,
    testTimeout: 30000,
  },
});
