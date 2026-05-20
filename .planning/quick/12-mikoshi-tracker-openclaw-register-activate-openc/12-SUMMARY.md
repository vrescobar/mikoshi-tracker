# Quick Task 12 Summary

**Description:** 修复 MikoshiTracker OpenClaw 插件缺少 register/activate 导出，确保 OpenClaw 直接加载 dist 入口
**Date:** 2026-03-13
**Code Commit:** `f1fc4a0`

## What Changed

- Added explicit OpenClaw entrypoint exports in `packages/openclaw-plugin/src/index.ts`: `register(api)`, `activate(api)`, and a default export pointing to `register`.
- Kept the existing `activateMikoshiTrackerOpenClawPlugin` helper as the shared implementation so the OpenClaw entrypoints and the existing test/runtime helper register the same MikoshiTracker tool catalog.
- Added bootstrap tests that exercise the new entrypoint exports and confirm they register the full `EXPECTED_TOOL_NAMES` tool set.
- Extended the built-artifact manifest test so `dist/index.js` must export `default`, `register`, and `activate`, preventing future `missing register/activate export` regressions.

## Verification

- `pnpm --filter @mikoshi-tracker/openclaw-plugin exec vitest run test/plugin-bootstrap.test.ts test/plugin-manifest.test.ts`
- `pnpm --filter @mikoshi-tracker/openclaw-plugin build`
- `pnpm --filter @mikoshi-tracker/openclaw-plugin test`
- `pnpm --filter @mikoshi-tracker/openclaw-plugin exec node --input-type=module -e "const mod = await import(new URL('./dist/index.js', import.meta.url)); console.log(JSON.stringify(Object.keys(mod).sort(), null, 2));"`

## Outcome

The built OpenClaw plugin entry now exposes the runtime hooks OpenClaw expects, while continuing to register the same MikoshiTracker tools and preserving the already-fixed package metadata and standalone bundling behavior.
