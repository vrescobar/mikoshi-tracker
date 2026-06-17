import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In production Caddy serves the built SPA and proxies /api + /magic to the
// API; this proxy config replicates that topology for `vite dev` AND for
// `vite preview` (preview inherits server.proxy), which Playwright uses.
const apiProxy = {
  // Segment-anchored regex: a plain "/api" string key matches by prefix and
  // would also swallow SPA routes like /api-access.
  "^/api(/|$)": { target: "http://127.0.0.1:3001", changeOrigin: true },
  "^/magic($|\\?)": { target: "http://127.0.0.1:3001", changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces so the dev server is reachable over the LAN /
    // Tailscale (e.g. http://100.71.187.4:3000), not just localhost. The
    // magic-link host is whatever you set in BETTER_AUTH_URL, so point that at
    // the same address you open in the browser and the two will agree.
    host: true,
    port: 3000,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
  },
});
