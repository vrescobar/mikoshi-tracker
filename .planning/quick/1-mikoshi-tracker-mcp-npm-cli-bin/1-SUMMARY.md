# Quick Task 1 Summary

**Description:** 修掉 `@mikoshi-tracker/mcp` npm 发布后的 CLI/bin 问题，并补发可验证版本
**Date:** 2026-03-10
**Code Commit:** `705e1b1`
**Published Version:** `0.1.1`

## What Changed

- Replaced runtime imports from `@mikoshi-tracker/contracts` with package-local schema modules so the published tarball no longer depends on monorepo-only workspace packages.
- Switched MCP package builds to `tsup` and flattened publish artifacts to `dist/cli.js` and `dist/index.js`.
- Removed runtime `require("../../package.json")` from the built CLI path by importing package metadata into the bundle at build time.
- Updated MCP package tests to validate the published bin/export layout and the runnable `stdio` entrypoint.
- Published `@mikoshi-tracker/mcp@0.1.1` with `pnpm publish`.

## Verification

- `pnpm --filter @mikoshi-tracker/mcp build`
- `pnpm --filter @mikoshi-tracker/mcp test`
- `pnpm pack --pack-destination /tmp/mikoshi-tracker-mcp-pack-011`
- `pnpm dlx /tmp/mikoshi-tracker-mcp-pack-011/mikoshi-tracker-mcp-0.1.1.tgz --timeout 1`
  - Expected result: startup reaches configuration validation and prints missing `MIKOSHI_TRACKER_API_URL`, `MIKOSHI_TRACKER_API_TOKEN`
- `pnpm dlx @mikoshi-tracker/mcp@0.1.1 --timeout 1`
  - Expected result: same configuration validation path from the public registry
- `npm dist-tag ls @mikoshi-tracker/mcp`
  - Result: `latest: 0.1.1`

## Outcome

The public package now installs and launches through `pnpm dlx` / `npx` as a normal `stdio` MCP server package. The previous tarball crash on `Cannot find module '../../package.json'` is resolved in `0.1.1`.
