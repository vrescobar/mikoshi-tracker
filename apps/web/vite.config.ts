import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In production Caddy serves the built SPA and proxies /api + /magic to the
// API; this proxy config replicates that topology for `vite dev` AND for
// `vite preview` (preview inherits server.proxy), which Playwright uses.
const apiProxy = {
  "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
  "/magic": { target: "http://127.0.0.1:3001", changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
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
