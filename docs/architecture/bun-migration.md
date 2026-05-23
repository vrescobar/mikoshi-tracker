# Bun Migration (pnpm → Bun)

## Scope

Replace **pnpm** with **Bun** as the monorepo package manager and script
runner. The Node.js runtime is kept for production services (Next.js standalone
and Fastify); Bun is used for installs, builds, and tests only (not as a
production server runtime — see rationale below).

## Rationale

| | pnpm 11 | Bun |
|---|---|---|
| `install` speed | baseline | 10–20× faster |
| Lockfile | `pnpm-lock.yaml` | `bun.lockb` (binary) |
| Workspace protocol | `workspace:*` | same |
| Script runner | `pnpm run` / `pnpm --filter` | `bun run` / `bun --filter` |
| `postinstall` hooks | runs always | runs always (same behaviour) |
| Test runner | vitest (kept) | vitest (kept) |
| Production server | Node.js | Node.js (Bun not yet stable for Next.js standalone) |

**Why not Bun as the production runtime?** Next.js's standalone `server.js`
is Node.js code. Bun has a compatibility layer but diverges on edge cases
(HTTP streams, `crypto`, `child_process`). Since the production server runs
on a Jetson 24/7, stability outweighs the marginal startup-time difference.
Bun as server can be revisited when Next.js officially supports it.

## What changes

### Package manager declaration

`package.json` (root):
```diff
-  "packageManager": "pnpm@11.2.2"
+  "packageManager": "bun@1.x"
```

### Lockfile

Delete `pnpm-lock.yaml`, run `bun install` → generates `bun.lockb`.
Commit `bun.lockb` (binary, but still tracked for reproducible installs).
Add `pnpm-lock.yaml` to `.gitignore`.

### Workspace config

Replace `pnpm-workspace.yaml`:
```diff
-packages:
-  - "apps/*"
-  - "packages/*"
```
with the equivalent in `package.json` (Bun reads workspaces from there):
```json
"workspaces": ["apps/*", "packages/*"]
```
Delete `pnpm-workspace.yaml` entirely.

### Scripts in `package.json` (root)

Replace `pnpm --filter X` with `bun --filter X`:

```diff
-"dev": "pnpm --parallel --filter @mikoshi-tracker/api dev --filter @mikoshi-tracker/web dev",
+"dev": "bun --filter @mikoshi-tracker/api run dev & bun --filter @mikoshi-tracker/web run dev",

-"postinstall": "pnpm --filter @mikoshi-tracker/api exec prisma generate ...",
+"postinstall": "bun --filter @mikoshi-tracker/api run prisma:generate",

-"typecheck": "pnpm -r exec tsc --noEmit",
+"typecheck": "bun -r run tsc --noEmit",

-"test": "pnpm --filter @mikoshi-tracker/api vitest run && pnpm --filter @mikoshi-tracker/web test:unit",
+"test": "bun --filter @mikoshi-tracker/api run test && bun --filter @mikoshi-tracker/web run test:unit",

-"test:e2e": "pnpm --filter @mikoshi-tracker/web playwright test",
+"test:e2e": "bun --filter @mikoshi-tracker/web run test:e2e",

-"lint": "eslint .",
+"lint": "bun run eslint .",
```

### Test infrastructure

`apps/api/test/helpers/global-setup.ts` currently invokes the Prisma CLI
directly (bypassing `pnpm exec`) to avoid triggering a workspace install:

```ts
const prismaBin = join(REPO_ROOT, "node_modules", ".bin", "prisma");
execFileSync(prismaBin, ["db", "push", ...], { cwd: REPO_ROOT });
```

This pattern works identically with Bun — no changes needed.

### Dockerfiles (kept for third-party deployments)

If the Dockerfiles are retained for users who self-host via containers, update
them to use Bun:

```diff
-FROM node:22-bookworm-slim AS base
-RUN corepack enable && corepack prepare pnpm@10.6.2 --activate
+FROM oven/bun:1 AS base

-RUN pnpm install --frozen-lockfile
+RUN bun install --frozen-lockfile

-RUN pnpm --filter @mikoshi-tracker/web build
+RUN bun --filter @mikoshi-tracker/web run build
```

The runner stage keeps `node:22-bookworm-slim` (no Bun in the runner — the
production process is still `node server.js`).

### CI / scripts

`scripts/self-host/check.sh`, `verify-clean-install.sh`,
`verify-upgrade.sh`: replace `pnpm` calls with `bun`.

### `.npmrc`

`SHARP_IGNORE_GLOBAL_LIBVIPS=true` is already in `.npmrc`. Bun reads
`.npmrc` for npm-compatible settings, so this continues to work.

---

## Migration Steps

1. **Remove pnpm artefacts**
   ```bash
   rm pnpm-lock.yaml pnpm-workspace.yaml
   ```

2. **Update `package.json`** — `packageManager` + `workspaces` + scripts
   (as shown above).

3. **Install**
   ```bash
   bun install
   ```
   Verify `bun.lockb` is created and all packages resolve.

4. **Smoke the commands**
   ```bash
   bun run typecheck
   bun --filter @mikoshi-tracker/api run test
   bun --filter @mikoshi-tracker/web run test:unit
   bun run lint
   ```

5. **Full test matrix**
   ```bash
   bun run prisma:generate
   bun --filter @mikoshi-tracker/api run build
   bun --filter @mikoshi-tracker/web run build
   bun run test:e2e
   bun run verify:openclaw
   ```

6. **Update Dockerfiles** (keep valid for non-Jetson users).

7. **Commit** — one commit `chore: migrate package manager pnpm → bun`.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A package not available / not resolving under Bun | Low | `bun install` will error; fix resolution or pin |
| `postinstall` hooks diverge | Low | `prisma generate` is invoked via direct binary path, not through the package manager runner |
| `vitest` invocation differences | Very low | vitest is framework-agnostic; `bun run vitest` works |
| Playwright E2E affected | None | Playwright uses its own Node.js; the package manager is irrelevant at test-run time |
| Bun workspace protocol edge cases | Low | Test `workspace:*` resolution early; fallback is to switch back to pnpm for a single package |

---

## Related

- `docs/architecture/deployment-native.md` — running web/API as systemd services (done before Bun migration)
- `docs/architecture/database-tests.md` — DB test audit
