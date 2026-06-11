import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: {
      // Jetson/ARM host: the Chromium zygote cannot fork renderer processes in
      // this environment, so `newPage()` hangs indefinitely and every test dies
      // in browser setup. Spawning renderers directly (no zygote) fixes it.
      args: ["--no-zygote"],
    },
  },
  webServer: [
    {
      command:
        "node -e \"require('fs').closeSync(require('fs').openSync('/tmp/mikoshi-tracker-playwright.db','w'))\" && node node_modules/.bin/prisma db push --config prisma.config.ts --schema prisma/schema.prisma --url file:/tmp/mikoshi-tracker-playwright.db --accept-data-loss && bun run --filter @mikoshi-tracker/api dev",
      cwd: "../..",
      port: 3001,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "file:/tmp/mikoshi-tracker-playwright.db",
        BETTER_AUTH_SECRET: "playwright-secret-with-at-least-thirty-two-characters",
        BETTER_AUTH_URL: "http://127.0.0.1:3001",
        CORS_ORIGIN: "http://127.0.0.1:3000",
        PORT: "3001",
      },
    },
    {
      // Vite preview serves the production build with the same /api + /magic
      // proxy the dev server uses (preview inherits server.proxy), mirroring
      // the Caddy topology in production.
      command:
        "bun run --filter @mikoshi-tracker/web build && bun run --filter @mikoshi-tracker/web preview",
      cwd: "../..",
      port: 3000,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
