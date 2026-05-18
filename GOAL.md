# Haaabit — Project Goal

> Project spec consumed by ralphloop. This document describes the **current
> implemented state** of Haaabit so an autonomous agent has a faithful baseline
> to reason against. It is descriptive, not aspirational: every feature listed
> below exists in the codebase today.

## What Haaabit is

Haaabit is a self-hosted habit-tracking application for individual users. It is
designed to be opened throughout the day to answer three questions at a glance:
what must be done now, what is already complete, and whether the habit system is
healthy overall. The same data powers both a web UI and an AI-assisted check-in
surface (MCP / OpenClaw plugin), so correctness, legibility, and a clean,
reversible audit trail are first-class concerns.

## Tech stack

- **Language:** TypeScript 5.9+ (strict mode)
- **Monorepo:** pnpm 10.6+ workspaces, Node.js 20+
- **API:** Fastify 5.8+ REST server (`apps/api`)
- **Web:** Next.js 16.2+ (App Router) + React 19 (`apps/web`)
- **Database:** SQLite via Prisma 7.8 ORM (libsql adapter supported)
- **Auth:** better-auth 1.6+ (email/password sessions)
- **Validation:** Zod 4.4+ for shared REST contracts (`packages/contracts`)
- **MCP:** `@modelcontextprotocol/sdk` 1.29+ (`packages/mcp`, stdio transport)
- **Tooling:** ESLint 9, Prettier 3, tsc/tsx/tsup
- **Tests:** Vitest 3.2 (API unit), Playwright 1.60 (E2E)
- **Deploy:** Docker / Podman multi-stage builds, Caddy reverse proxy

## Repository layout

```
apps/api/              Fastify REST API server
apps/web/              Next.js web application
packages/contracts/    Shared Zod schemas + TypeScript types (REST contracts)
packages/mcp/          Standalone MCP server (stdio)
packages/openclaw-plugin/  Native OpenClaw plugin (same tool surface as MCP)
prisma/                schema.prisma + migrations
docker/                Caddy reverse-proxy config
docs/                  Self-hosting and public-deployment guides
tests/                 Playwright E2E tests
```

## Domain model

- **User** — id, name, email, `isAdmin`, `timezone` (default `Asia/Shanghai`).
  The first user to register is auto-promoted to admin.
- **Habit** — `kind` (`BOOLEAN` | `QUANTITY`), name, description, category,
  `frequencyType` (`DAILY` | `WEEKDAYS` | `WEEKLY_COUNT` | `MONTHLY_COUNT`),
  `frequencyCount`, `targetValue`, `unit`, `startDate`, `isActive`.
- **HabitWeekday** — links a habit to specific weekdays (for `WEEKDAYS`).
- **HabitDayState** — per-day record (`dateKey` `YYYY-MM-DD`, numeric `value`,
  boolean `completed`); created lazily on first access.
- **CheckInMutation** — immutable audit row for every check-in change: `type`
  (`COMPLETE` | `SET_TOTAL` | `UNDO`), `source` (`WEB` | `AI` | `SYSTEM`),
  before/after value and completion state. Undo is implemented by replaying this
  history, never by deleting rows.
- **ApiToken** — one personal token per user, stored as a SHA-256 hash.
- **Session / Account / Verification / AppSettings** — better-auth tables;
  `AppSettings.registrationEnabled` gates new sign-ups.

## Core habit logic

- **Habit kinds:** boolean (done / not done) and quantity (numeric target with a
  unit, e.g. "10 pages").
- **Frequency:** daily, specific weekdays, N-times-per-week, N-times-per-month.
- **"Due today"** is resolved per habit from its frequency type and the user's
  timezone; `resolveHabitDay()` converts a timestamp to the user's local
  `dateKey`.
- **Streaks:** current streak walks backward from today over *settled* history
  (excluding today's pending state); longest streak walks the full history.
  Totals track completions and missed periods.
- **Analytics:** 7-day and 30-day completion-rate trends; a "stability ranking"
  orders habits by recent (30-day) completion rate; weekly completion rate is
  aggregated across active habits.

## REST API (`apps/api`)

All endpoints are authenticated by session cookie or `Authorization: Bearer
haaabit_<token>`.

- `GET/POST /api/habits`, `GET/PATCH /api/habits/:id`,
  `POST /api/habits/:id/archive`, `POST /api/habits/:id/restore`
- `GET /api/today`, `POST /api/today/complete`, `POST /api/today/set-total`,
  `POST /api/today/undo`
- `GET /api/stats/overview`
- `GET /api/auth/registration`, `POST /api/auth/sign-up/email`,
  `GET /api/session`
- `GET/POST /api/admin/registration` (admin only — toggle sign-ups)
- `GET /api/api-access/token`, `POST /api/api-access/token/reset`
- `GET /api/openapi.json`, `GET /api/docs`, `GET /health`

## MCP / OpenClaw tool surface

`packages/mcp` and `packages/openclaw-plugin` expose the same 11 tools, all
backed by the REST API. Results follow a fixed contract:
`{ ok: true, toolName, summary, data }` on success, or
`{ ok: false, toolName, error: { category, code, message, hint, retryable,
resolution, suggestedTool } }` on failure.

- **Read:** `habits_list`, `habits_get_detail`, `today_get_summary`,
  `stats_get_overview`
- **Habit writes:** `habits_add`, `habits_edit`, `habits_archive`,
  `habits_restore`
- **Today writes:** `today_complete`, `today_set_total`, `today_undo`

## Web app (`apps/web`)

Next.js App Router with route groups:

- `(auth)/` — sign-up / sign-in
- `(app)/dashboard` — today-first overview, metrics, trends
- `(app)/habits`, `(app)/habits/new`, `(app)/habits/[habitId]` — list, create,
  and per-habit detail (stats, history, trends)
- `(app)/api-access` — personal API-token management

Styling uses CSS Modules per component plus Radix UI dialogs; no external CSS
framework. The UI is bilingual (English / Chinese) with browser-language
detection.

### Design intent (see `CLAUDE.md`)

Light-mode-first, calm and refined. Today's priorities must be readable at a
glance before any decoration. One coherent visual system across auth, dashboard,
habits, detail, and API surfaces. Typography, spacing, and contrast carry the
hierarchy; no noisy gamification, no purple-on-white SaaS defaults.

## Authentication & security

- Email/password sessions via better-auth; first user becomes admin and can
  toggle registration globally.
- Personal API tokens (`haaabit_<48-hex>`), SHA-256-hashed at rest, rotatable
  from the web UI, used for MCP / programmatic access.
- Helmet security headers + CSP (inline styles only, no remote scripts).
- Rate limiting: 300 req/min global, 20 req/min on auth endpoints; trusts the
  proxy header when running behind Caddy.

## Deployment

- Multi-stage `Dockerfile.api` / `Dockerfile.web`, run as non-root `node` user.
- SQLite database mounted as a volume (`/data/haaabit.db`).
- Caddy reverse proxy fronts the stack; `HAAABIT_SITE_ADDRESS` enables
  automatic Let's Encrypt TLS for public deployment.
- `docker compose run --rm migrate` applies Prisma migrations;
  `docker compose up -d` starts the stack. Podman-compatible.
- Required env: `BETTER_AUTH_SECRET`. Optional: `APP_BASE_URL`, `DATABASE_URL`,
  `BETTER_AUTH_URL`, `CORS_ORIGIN`, `PORT`, `HAAABIT_PUBLIC_PORT`,
  `HAAABIT_SITE_ADDRESS` (see `.env.example`).

## Collaboration — Habit Circles (planned feature, not yet implemented)

> **Status: target, not current state.** Everything above describes Haaabit as
> it exists today: strictly single-user — one `ApiToken` (SHA-256 hash,
> `haaabit_<hex>`) maps to exactly one `User`, and the API filters everything by
> `userId`. The section below is the **next feature to build**: a social /
> collaboration layer called *Circles*. The full implementation plan and
> phasing live in `PLAN-CIRCLES.md` and in `.ralphloop/tasks.md`.

### Concept

A **Circle** is a habit contest: several people, each with their own Haaabit
account, form a group with a shared leaderboard. An external agent (a WhatsApp
bot driven by the Mikoshi project) can **read and record check-ins** on the
habits each member chooses to share — but **never** on un-shared habits and
**never** on another person's account.

### Governing design decisions

- The concept is named `Circle` to avoid colliding with the WhatsApp "group".
- **Authorization authority lives in Haaabit and is enforced server-side.** The
  bot gets a narrow-scope token; the server never trusts the client (or its
  LLM) to self-limit. Out-of-scope requests get `403`/`404`. This is the
  central security property.
- A **circle token is not a global admin token.** It is scoped to *one* circle,
  *only* the habits shared in it, and *only* check-in writes. A leaked token's
  blast radius is one circle, not the instance.
- **Sharing a habit into a circle is the owner's consent act**, performed with
  the owner's own session. A circle owner cannot touch another member's habits.
- Circles are a **new REST surface** (`/api/circles/...`) consumed directly by
  the Mikoshi skill via `fetch`. The feature does **not** go through the
  `@haaabit/mcp` package, which stays the single-user personal-token bridge.

### New data model (`prisma/schema.prisma`)

- **Circle** — id, name, `ownerId`, timestamps.
- **CircleMembership** — `circleId`, `userId`, `role` (`owner` | `member`),
  `externalId` (opaque integration id, e.g. a Mikoshi identity), `joinedAt`;
  unique `(circleId, userId)` and `(circleId, externalId)`.
- **CircleHabitShare** — `(circleId, habitId)`; a habit is visible/mutable to a
  circle *only* if a row exists here. This is the per-habit privacy opt-in.
- **CircleToken** — `circleId`, `token` (SHA-256 hash), `label`, timestamps;
  prefix `haaabit_circle_`. Scope is enforced in code, not modeled as a column.

### Authorization core

- `apps/api/src/auth/circle-token.ts` — mint/hash/lookup/revoke circle tokens
  (mirror of `api-token.ts`).
- `apps/api/src/auth/circle-session.ts` — `requireCircleContext(request,
  pathCircleId)`: a circle token authenticates a *circle*, not a user. Missing
  Bearer → `401`; unknown token → `401`; token's circle ≠ URL `:circleId` →
  `403`. This file is the authority boundary.
- `circle.service.ts` exposes `assertCircleHabitWritable(circleId, userId,
  habitId)` which every write path runs before mutating: member-of-circle
  (`404`), habit-belongs-to-user (`404`), habit-active (`409 HABIT_INACTIVE`),
  habit-shared-in-circle (`403`). Writes then **delegate to the existing
  check-in service** — no mutation logic is duplicated. Circle check-ins are
  recorded with `CheckInMutation.source = "circle"`.
- A circle token's `undo` reverts **only the latest circle-sourced mutation**
  of the day — it can never undo a member's own `web` or `ai` check-in. The
  bot's blast radius stays limited to what the bot itself wrote.

### Shared contracts come first

`packages/contracts/src/circles.ts` (Zod schemas + types for every circle
endpoint) is authored **before** the API module, so the API handlers and the
web client both import one definition. Schemas are never redefined per layer.

### REST surface (`apps/api/src/modules/circles/`)

Circle-token-authenticated, under `/api/circles/:circleId`: `GET /members`,
`GET /leaderboard`, `GET /members/:userId/habits`, and
`POST .../habits/:habitId/{complete,set-total,undo}`.

Session-authenticated management: `POST/GET /api/circles`,
`GET /api/circles/:circleId`, member CRUD (owner), habit share/unshare
(member, own habits only), and token mint/list/revoke (owner). The plain token
is returned exactly once. Routes are added to the OpenAPI surface and
`/api/docs`.

### Web

A "Circles" section consistent with the `CLAUDE.md` design language: circle
list, circle detail (members, leaderboard, own-habit share toggles), and
owner-only management (members, `externalId`, token minting). The UI must be
**explanatory**: every option that grants access or shares data — sharing a
habit, minting a circle token, setting an `externalId`, removing a member —
carries plain-language copy stating what it does and its consequences, so a
self-hosting user understands the privacy and authority trade-off before
acting. Secrets (the plain circle token) are shown once with an explicit
warning, as the existing `api-access` panel does.

### Internationalization

Haaabit's UI is currently bilingual (English / Chinese). As part of this work
the whole GUI — every existing screen plus the new Circles section — also gets
a **Spanish (`es`)** translation, making the app trilingual with browser
language detection across `en` / `zh` / `es`.

### Acceptance

The single-user flow and `@haaabit/mcp` package must remain intact (no
regressions). The defining test is the **circle-token denial matrix** (see
`PLAN-CIRCLES.md` §9): cross-circle token → `403`, non-member → `404`,
foreign habit → `404`, un-shared habit → `403`, archived habit → `409`, and a
happy path producing a `CheckInMutation` with `source: "circle"` reflected in
the leaderboard.

## Quality gates

- `pnpm test` — API unit tests (Vitest)
- `pnpm test:e2e` — Playwright browser tests
- `pnpm verify:openclaw` — OpenClaw plugin validation suite
- ESLint + Prettier + workspace-wide type checking, enforced in CI
  (GitHub Actions).

## Working agreement for autonomous changes

- Keep the REST contract, MCP tool contract, and web UI in sync — they share
  `packages/contracts`.
- Preserve the immutable `CheckInMutation` audit trail; never satisfy an "undo"
  or "edit" by deleting history.
- Respect per-user timezones in all date math.
- Match the existing design language defined in `CLAUDE.md`.
- A change is not done until the relevant quality gates above pass.
