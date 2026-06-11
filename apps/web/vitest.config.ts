import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Cast: @vitejs/plugin-react types resolve against vite 6 while
  // vitest/config bundles vite 7 types; the runtime plugin API is compatible.
  plugins: [react() as never],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/__tests__/**/*.test.{ts,tsx}", "**/*.unit.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
