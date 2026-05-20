# MikoshiTracker — Project Goal

> Project spec consumed by ralphloop. This document describes the **current
> implemented state** of MikoshiTracker so an autonomous agent has a faithful baseline
> to reason against. It is descriptive, not aspirational: every feature listed
> below exists in the codebase today.

## What MikoshiTracker is

MikoshiTracker is a self-hosted habit-tracking application for individual users. It is
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
mikoshi_tracker_<token>`.

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
- Personal API tokens (`mikoshi_tracker_<48-hex>`), SHA-256-hashed at rest, rotatable
  from the web UI, used for MCP / programmatic access.
- Helmet security headers + CSP (inline styles only, no remote scripts).
- Rate limiting: 300 req/min global, 20 req/min on auth endpoints; trusts the
  proxy header when running behind Caddy.

## Deployment

- Multi-stage `Dockerfile.api` / `Dockerfile.web`, run as non-root `node` user.
- SQLite database mounted as a volume (`/data/mikoshi-tracker.db`).
- Caddy reverse proxy fronts the stack; `MIKOSHI_TRACKER_SITE_ADDRESS` enables
  automatic Let's Encrypt TLS for public deployment.
- `docker compose run --rm migrate` applies Prisma migrations;
  `docker compose up -d` starts the stack. Podman-compatible.
- Required env: `BETTER_AUTH_SECRET`. Optional: `APP_BASE_URL`, `DATABASE_URL`,
  `BETTER_AUTH_URL`, `CORS_ORIGIN`, `PORT`, `MIKOSHI_TRACKER_PUBLIC_PORT`,
  `MIKOSHI_TRACKER_SITE_ADDRESS` (see `.env.example`).

## Collaboration — Habit Circles

> **Status.** §C1–§C16 (the Circles social layer) are **implemented and
> shipped**. §C17 (external provisioning for bot-operated circles) is the
> **current in-progress addition** — see `PLAN.md`. This section is the full,
> self-contained specification; `.ralphloop/tasks.md` is the phased checklist
> that implements it and cites the `§C…` subsections below.

### C1 — Concept

A **Circle** is a habit contest: several people, each with their own MikoshiTracker
account, form a group with a shared leaderboard. An external agent (a WhatsApp
bot driven by the separate Mikoshi project) can **read and record check-ins**
on the habits each member chooses to share — but **never** on un-shared habits
and **never** on another person's account. The Mikoshi side (the bridge skill
and WhatsApp wiring) is out of scope here; MikoshiTracker's circle API must exist
first so that skill can consume it.

### C2 — Governing design decisions

- The concept is named `Circle` to avoid colliding with the WhatsApp "group"
  and with any future internal grouping.
- **Authorization authority lives in MikoshiTracker and is enforced server-side.** The
  bot gets a narrow-scope token; the server never trusts the client (or its
  LLM) to self-limit. Out-of-scope requests get `403`/`404`. This is the
  central security property.
- A **circle token is not a global admin token.** There is no "read-all-MikoshiTracker"
  token. It is scoped to *one* circle, *only* the habits shared in it, and
  *only* check-in writes. A leaked token's blast radius is one circle, not the
  instance.
- **Sharing a habit into a circle is the owner's consent act**, performed with
  the owner's own session. A circle owner governs memberships and tokens but
  **cannot** share or read another member's habits (beyond the aggregated
  leaderboard).
- Circles are a **new REST surface** (`/api/circles/...`) consumed directly by
  the Mikoshi skill via `fetch`. The feature does **not** go through the
  `@mikoshi-tracker/mcp` package, which stays the single-user personal-token bridge.

### C3 — Data model (`prisma/schema.prisma`)

Four new models (SQLite via Prisma; client generated into
`apps/api/src/generated/prisma`):

```prisma
model Circle {
  id          String             @id @default(cuid())
  name        String
  ownerId     String
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  owner       User               @relation("CircleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  memberships CircleMembership[]
  habitShares CircleHabitShare[]
  tokens      CircleToken[]
}

model CircleMembership {
  id         String   @id @default(cuid())
  circleId   String
  userId     String
  role       String   @default("member")   // "owner" | "member"
  externalId String?                        // opaque integration id (e.g. a Mikoshi identityId)
  joinedAt   DateTime @default(now())
  circle     Circle   @relation(fields: [circleId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([circleId, userId])
  @@unique([circleId, externalId])          // SQLite allows multiple NULLs; a non-null externalId is unique per circle
  @@index([externalId])
}

model CircleHabitShare {
  id        String   @id @default(cuid())
  circleId  String
  habitId   String
  createdAt DateTime @default(now())
  circle    Circle   @relation(fields: [circleId], references: [id], onDelete: Cascade)
  habit     Habit    @relation(fields: [habitId], references: [id], onDelete: Cascade)

  @@unique([circleId, habitId])
  @@index([habitId])
}

model CircleToken {
  id        String   @id @default(cuid())
  circleId  String
  token     String   @unique                // SHA-256 hash, like ApiToken
  label     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  circle    Circle   @relation(fields: [circleId], references: [id], onDelete: Cascade)

  @@index([circleId])
}
```

Inverse relations to add on existing models: on `User`,
`circlesOwned Circle[] @relation("CircleOwner")` and
`circleMemberships CircleMembership[]`; on `Habit`,
`circleShares CircleHabitShare[]`.

Schema design notes:

- **`externalId` is deliberately opaque.** MikoshiTracker stores one string per
  membership and does *not* know it is a WhatsApp JID or a Mikoshi identity.
  This keeps the social layer decoupled from WhatsApp and reusable for other
  integrations. JID→account resolution happens in the Mikoshi skill, not here.
- **`CircleHabitShare` is the per-habit privacy opt-in.** A habit is visible
  and mutable to a circle only if a row exists here. The initial test fills it
  in bulk ("share everything"); the schema supports per-member choice with no
  change.
- **`CircleToken` scope is not modeled as a column** — it is a property of the
  code: the auth layer and circle service only ever expose reading shared
  habits + writing check-ins. No `CircleToken`-authenticated endpoint
  creates/edits/archives habits or touches accounts.
- Migration: `pnpm prisma migrate dev --name add_circles`, then regenerate the
  Prisma client and confirm `apps/api` still builds.

### C4 — Shared contracts come first

`packages/contracts/src/circles.ts` (Zod input/output schemas + types for
**every** circle endpoint, consistent with `habits.ts`/`today.ts`) is authored
**before** the API module and wired into the package index, so the API
handlers and the web client both import one definition. Schemas are never
redefined per layer.

### C5 — Circle token module (`apps/api/src/auth/circle-token.ts`)

Mirror of `api-token.ts`. Functions:

- `generateCircleToken()` → `mikoshi_tracker_circle_${randomBytes(24).toString("hex")}`.
- `hashCircleToken(token)` → `createHash("sha256")…` (same pattern as personal
  tokens).
- `createCircleToken(db, circleId, label?)` → generates, hashes, inserts a
  `CircleToken`; returns `{ token, tokenId, createdAt }`. The plain token is
  returned **exactly once**, like `resetPersonalApiToken`.
- `findCircleByToken(db, token)` → looks up `CircleToken` by hash, includes
  `circle`; returns `{ circle, tokenId } | null`.
- `listCircleTokens(db, circleId)` → metadata only (no token value), for the UI.
- `revokeCircleToken(db, tokenId)` → deletes the row.

The `mikoshi_tracker_circle_` prefix visually distinguishes a circle token from a
personal one.

### C6 — Circle auth boundary (`apps/api/src/auth/circle-session.ts`)

A distinct auth path from `requireAuthenticatedUser`: a circle token
authenticates a **circle**, not a user.

```ts
export class CircleAuthError extends Error {
  constructor(public readonly statusCode: 401 | 403 | 404, message: string) { ... }
}

export interface CircleContext {
  circle: { id: string; name: string; ownerId: string };
  tokenId: string;
}

// Extracts the Bearer, resolves findCircleByToken, and REQUIRES the token's
// circle to match the route :circleId. Any mismatch => 403.
export async function requireCircleContext(
  request: FastifyRequest,
  pathCircleId: string,
): Promise<CircleContext>;
```

Rules: missing Bearer → `401`; unknown token → `401`; valid token but
`circle.id !== pathCircleId` → **`403`** (a circle token operates only on its
own circle; it cannot address another via the URL). This file is **the
authority boundary** — every `/api/circles/:circleId/*` route authenticated by
circle token passes through it first.

### C7 — Circles module (`apps/api/src/modules/circles/`)

Follows the repo's existing module pattern (`habits/`, `today/`, `stats/`):
`circle.schema.ts` (Zod in/out), `circle.repository.ts` (pure Prisma queries),
`circle.service.ts` (business logic **and** authorization), `circle.controller.ts`
(Fastify handlers), `circle.routes.ts` (route registration +
`circleApiRouteDefinitions` for OpenAPI). Routes are registered in
`apps/api/src/server.ts`.

### C8 — Authorization core (security)

`circle.service.ts` exposes a single `assertCircleHabitWritable(circleId,
userId, habitId)` that **every** write path runs before mutating anything:

```
given (circleId from token, userId from route, habitId from route):
  1. userId MUST have a CircleMembership in circleId      → else 404 "member not in circle"
  2. habitId MUST belong to userId (Habit.userId)         → else 404 "habit not found"
  3. habitId MUST be active (isActive)                    → else 409 HABIT_INACTIVE
  4. (circleId, habitId) MUST exist in CircleHabitShare   → else 403 "habit not shared in this circle"
```

For reads (`/members/:userId/habits`), rule 1 applies and the result is
filtered by `CircleHabitShare`; an un-shared habit **never** appears in the
response.

After the check passes, writes **reuse the existing check-in service**
(`apps/api/src/modules/checkins/checkin.service.ts`) with the already-resolved,
authorized `userId`. Mutation logic and `HabitDayState`/`CheckInMutation`
handling are **not** duplicated — `circle.service` is only authorization +
delegation. Circle check-ins are recorded with `CheckInMutation.source =
"circle"`.

**Scoped `undo`:** a circle token **cannot undo mutations it did not create**.
The `undo` route resolves the day's latest mutation for `(userId, habitId)` and
**requires its `source` to be `"circle"`**; if the latest is `web` or `ai` it
returns `409 UNDO_NOT_CIRCLE_SOURCED` and touches nothing. The web's own
personal-token `undo` keeps its current behavior unchanged.

### C9 — REST surface

**Circle-token-authenticated** — all under `/api/circles/:circleId`, each
starting with `requireCircleContext(request, circleId)`:

| Method | Route | Type | Description |
|---|---|---|---|
| `GET`  | `/members` | read | `{ userId, displayName, role, externalId }` per member. |
| `GET`  | `/leaderboard` | read | Per-member stats **over shared habits only** (completed today, streak, weekly rate). |
| `GET`  | `/members/:userId/habits` | read | That member's **shared** habits + today's state. |
| `POST` | `/members/:userId/habits/:habitId/complete` | write | Boolean check-in. |
| `POST` | `/members/:userId/habits/:habitId/set-total` | write | Quantity check-in (`{ total }`). |
| `POST` | `/members/:userId/habits/:habitId/undo` | write | Undo the day's latest **`source: "circle"`** mutation (see §C8). |

**Session-authenticated management** — uses `requireSession` /
`requireAuthenticatedUser`:

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST`   | `/api/circles` | session | Create a circle; creator becomes `owner` + first `CircleMembership`. |
| `GET`    | `/api/circles` | session | Circles the user belongs to. |
| `GET`    | `/api/circles/:circleId` | session (member) | Circle detail: members, the user's own shared habits. |
| `POST`   | `/api/circles/:circleId/members` | session (owner) | Add a member **by email** (test shortcut; see §C10). |
| `PATCH`  | `/api/circles/:circleId/members/:membershipId` | session (owner) | Edit `role` and `externalId`. |
| `DELETE` | `/api/circles/:circleId/members/:membershipId` | session (owner) | Remove a member. |
| `POST`   | `/api/circles/:circleId/shares` | session (member) | Share **an own habit** (`{ habitId }`); verifies `Habit.userId === session.user.id`. |
| `DELETE` | `/api/circles/:circleId/shares/:habitId` | session (member) | Unshare an own habit. |
| `POST`   | `/api/circles/:circleId/tokens` | session (owner) | Mint a `CircleToken`; returns the plain token **once**. |
| `GET`    | `/api/circles/:circleId/tokens` | session (owner) | Token metadata (no value). |
| `DELETE` | `/api/circles/:circleId/tokens/:tokenId` | session (owner) | Revoke a token. |

Golden rule: **a user may only share habits they own.** Also add `"circle"` to
the `CheckInMutation` source enum in `apps/api/src/modules/checkins/checkin.schema.ts`
and `packages/contracts/src/checkins.ts` (alongside `web`/`ai`/`system`).

### C10 — Member onboarding (consent)

- **Product-correct design:** the owner creates an *invitation*; the invitee
  accepts it from their own session, which creates the `CircleMembership` —
  guaranteeing consent.
- **Test shortcut:** `POST /api/circles/:circleId/members` with an existing
  email creates the membership directly (owner only). Acceptable because the
  initial test participants coordinate out of band. The formal invitation flow
  is a later, non-blocking phase.

### C11 — OpenAPI

Add `circleApiRouteDefinitions: PublicApiRouteDefinition[]` in
`circle.routes.ts` and register them in `publicApiRouteDefinitions`
(`apps/api/src/plugins/openapi.ts`). Add a `CircleBearerAuth` security scheme
(or extend `BearerAuth` with "personal token **or** circle token"). Surface a
"Circles" section in `/api/docs`.

### C12 — Web GUI (consistent + explanatory)

A "Circles" section that is a **first-class part of the app**, not a deferrable
add-on: same visual language as auth/dashboard/habits per `CLAUDE.md`
(light-mode-first, calm, typographic hierarchy, CSS Modules, Radix dialogs),
reusing existing `components/ui/` primitives. It is delivered complete — with
empty/loading/error states and responsive layout — never "exercised via curl".

Screens: (1) circle list + "Create circle" flow with empty state; (2) circle
detail — members, leaderboard, and the user's own habits with a "share in this
circle" toggle; (3) owner-only management — add/remove members, edit
`externalId`, mint/list/revoke circle tokens (plain token shown once, with a
copy affordance and warning, like the `api-access` panel).

**The GUI must be explanatory.** MikoshiTracker is self-hosted — the user is their own
administrator and must understand what each action grants. Every option that
shares data or grants access carries plain-language copy, visible before acting
(not hidden in a tooltip), stating what it does and its consequences. At
minimum:

- **Share a habit** — the circle, and any bot holding a circle token, will be
  able to see this habit and record check-ins on it.
- **Mint a circle token** — a credential that can read shared habits and write
  check-ins for the *whole* circle; shown only once; explain how to revoke it.
- **Edit `externalId`** — links this member to an external identity (e.g.
  WhatsApp); a wrong value would pair the member with the wrong account.
- **Remove a member / unshare** — what stops being visible, and that history is
  not deleted.

### C13 — Internationalization

MikoshiTracker's UI is currently bilingual (English / Chinese). As part of this work
the **whole GUI** — every existing screen (auth, dashboard, habits, detail,
api-access) plus the new Circles section, including all explanatory copy from
§C12 — also gets a **Spanish (`es`)** translation, wired into the language
switcher and browser language detection, making the app trilingual
`en` / `zh` / `es` with no untranslated strings.

### C14 — Tests (Vitest, `apps/api`)

The defining test is the **circle-token denial matrix** — it proves security
does not depend on well-behaved clients:

1. Circle-A token operating on circle B's `:circleId` → **403**.
2. Write against a `userId` **not a member** of the circle → **404**.
3. Write against a `habitId` that exists but **does not belong** to that
   `userId` → **404**.
4. Write against a member's habit **not shared** in the circle → **403**.
5. Write against an **archived** habit → **409 HABIT_INACTIVE**.
6. Happy path: member + shared habit → check-in OK, a `CheckInMutation` with
   `source: "circle"` appears, and the leaderboard reflects it.
7. `GET /members/:userId/habits` **never** includes an un-shared habit.
8. Management: a non-owner gets 403 minting a token or adding a member; a
   member cannot share a habit that is not theirs (403/404).
9. Circle-token `undo` when the day's latest mutation is `web`/`ai` →
   **`409 UNDO_NOT_CIRCLE_SOURCED`** with the user's mutation untouched; when
   the latest is `source: "circle"`, the `undo` succeeds (§C8).

Additional coverage: `circle-token` hash/lookup; `requireCircleContext` with an
absent / unknown / cross-circle token.

### C15 — Acceptance

- `pnpm --filter @mikoshi-tracker/api test` green, including the §C14 matrix.
- `pnpm -r build` / workspace typecheck green after regenerating Prisma.
- `pnpm -r lint` green.
- A circle with one owner and one member, each with shared habits, exposes a
  correct leaderboard via a circle token; `complete` on a shared habit works,
  on an un-shared one returns 403.
- `/api/docs` documents the circle surface.
- The Circles web section is complete (empty/loading/error states, responsive)
  and every access-/data-sharing action carries explanatory copy (§C12).
- The whole GUI is translated to Spanish; the app runs in `en` / `zh` / `es`
  with no untranslated strings (§C13).
- The `@mikoshi-tracker/mcp` package and the single-user personal-token flow remain
  **intact** (no test regressions).

### C16 — Open risks (not in scope, tracked for later)

- Circle-token writes are a real authority grant — kept narrow (check-ins on
  shared habits only). Do not widen the token's scope without revisiting this
  spec.
- `externalId` is set by the owner; a wrong value mis-pairs a member. Future
  mitigation: invitee-confirmed self-linking.
- Finer-grained tokens (read-only, single-habit) are a future evolution — would
  add a `scope` column to `CircleToken`.
- Circle endpoints fall under the existing global rate limit; revisit a
  per-`CircleToken` limit if the feature opens to many circles.

### C17 — External provisioning for bot-operated circles

A small **additive** layer (it changes none of §C1–§C16) so an external agent —
Mikoshi — can run a circle as a contest where **each participant's check-ins are
written with that participant's own personal token**, never a shared cross-user
token. Without it, every participant would have to self-register through the web
UI. Full plan: `PLAN.md`. Phased checklist: `.ralphloop/tasks.md` → Phase 11.

**C17.1 — `User.externalId`.** Add `externalId String? @unique` to `User` — an
opaque integration id (a Mikoshi `identityId`), one external identity ⇄ one
MikoshiTracker user. Deliberately opaque: MikoshiTracker does not know it is a WhatsApp
identity. Migration: `pnpm prisma migrate dev --name add_user_external_id`.

**C17.2 — System-key auth (`apps/api/src/auth/admin-key.ts`).** A fourth auth
path, distinct from sessions, personal `ApiToken`s, circle tokens, and the
`User.isAdmin` role. Env var `MIKOSHI_TRACKER_ADMIN_API_KEY`; a Fastify guard validates
`Authorization: Bearer <key>` with a **timing-safe** compare. Missing/wrong →
`401`. If the env var is unset, every `/api/admin/*` provisioning route →
`503` (feature disabled, never an open endpoint). It is an env-configured
operator secret, not a DB token.

**C17.3 — `POST /api/admin/provision-user`** (system-key auth). Body
`{ externalId, name?, timezone? }`. Existing `externalId` → `200 { userId,
alreadyExists: true }` (the personal token is minted once at creation, not
re-issued). New → create the `User` directly via Prisma, bypassing better-auth
sign-up: synthetic unique `email`, `emailVerified: true`, **no `Account` row**
(API-only user, no password login), `timezone` default; mint a personal token
via the existing `generatePersonalApiToken` / `ApiToken` machinery; **bypass**
the `AppSettings.registrationEnabled` gate (admin action, not public sign-up).
→ `201 { userId, personalToken, alreadyExists: false }`. Companion
`POST /api/admin/provision-user/reset-token` `{ externalId }` rotates the token.

**C17.4 — `POST /api/admin/circles/:circleId/members`** (system-key auth). Body
`{ externalId }`. Resolves the `User` by `externalId` (`404` if not
provisioned), creates a `CircleMembership` (`role: "member"`, same `externalId`).
Idempotent. → `{ membershipId, userId, externalId }`. This is the bot's
enrolment path — adding members is otherwise owner-only (§C9); the **circle
token still cannot add members** (§C2).

**C17.5 — Expose `externalId` in circle reads.** `GET .../leaderboard` (like
`GET .../members`, §C9) includes `externalId` per member, so the bot maps
standings back to external identities. Update `packages/contracts/src/circles.ts`.

**Unchanged.** Circle-token check-in endpoints, habit sharing, circle models and
tokens, and the web GUI are untouched. Mikoshi writes contest check-ins with
each user's **personal** token against `/api/today/*`; it uses the circle token
**read-only** for the leaderboard.

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
