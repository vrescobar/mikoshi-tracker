import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone operator SPA. In dev it proxies /api → the local API (port 3001)
// so calls are same-origin and CORS is sidestepped entirely. In production the
// SPA is served from a trusted origin that must be added to the API's
// CORS_ORIGIN allowlist (it authenticates by Bearer header, not cookies).
export default defineConfig(({ command }) => ({
  // Production build is served by Caddy under /admin/ (same origin as /api, so
  // CORS is sidestepped). Dev keeps the root base so http://localhost:5174 works.
  base: command === "build" ? "/admin/" : "/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}));
