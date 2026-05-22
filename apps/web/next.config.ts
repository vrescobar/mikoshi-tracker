import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@mikoshi-tracker/contracts"],
  // Type-checking runs as a dedicated `pnpm typecheck` step; re-running it
  // inside `next build` only adds time on the ARM host with no added safety.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
