# PLAN — External provisioning for bot-operated circles

> **Status: target, not current state.** This plan adds a small **external
> provisioning** layer on top of the already-built Habit Circles feature
> (`GOAL.md` → "Collaboration — Habit Circles", §C1–§C16, shipped). It is the
> MikoshiTracker-side counterpart of the Mikoshi multi-user-skills work
> (`~/projects/mikoshi/docs/design/multi-user-skills.md`). The phased checklist
> that implements it is `.ralphloop/tasks.md` → "Phase 11"; the self-contained
> spec is `GOAL.md` §C17.

## Context

Mikoshi (a WhatsApp agent) is rewriting its habit-contest skill so that **each
participant's check-ins are written with that participant's own personal MikoshiTracker
token** — never a shared cross-user token. For that to work without a human
clicking through the MikoshiTracker web UI for every participant, MikoshiTracker must let
Mikoshi:

1. **Provision** a MikoshiTracker account bound to an opaque external identity (a
   Mikoshi `identityId`) and get back that user's personal API token.
2. **Enrol** that user into a circle by external identity.

Today neither is possible from the API: users self-register through better-auth
(`POST /api/auth/sign-up/email`) and the only cross-user surface is the
circle token (check-in writes, owner-minted). The `User.isAdmin` role only
toggles registration. This plan adds a narrow **system-key admin surface**.

The Circles feature itself does **not** change — models, memberships, shares,
leaderboard and circle tokens stay. `CircleMembership.externalId` already exists.
This is purely additive.

## What gets built (the contract)

### H1 — Schema (`prisma/schema.prisma`)

Add `externalId String? @unique` to the `User` model — an opaque integration id
(a Mikoshi `identityId`), so one external identity maps to exactly one MikoshiTracker
user. `CircleMembership.externalId` already exists; only its API exposure (H5)
is missing. Apply with `pnpm prisma migrate dev --name add_user_external_id`,
regenerate the Prisma client, confirm `apps/api` still builds.

### H2 — System-key auth (`apps/api/src/auth/admin-key.ts`, new)

A new auth path, distinct from sessions, personal `ApiToken`s and circle tokens,
and distinct from the `User.isAdmin` role:

- Env var `MIKOSHI_TRACKER_ADMIN_API_KEY` (documented in `.env.example`).
- A Fastify `preHandler` / guard that reads `Authorization: Bearer <key>` and
  compares it to the env value with a **timing-safe** comparison
  (`crypto.timingSafeEqual`). Missing or wrong → `401`.
- If `MIKOSHI_TRACKER_ADMIN_API_KEY` is unset, every `/api/admin/*` provisioning route
  responds `503` (feature disabled) — never an open endpoint.
- This is an env-configured shared secret, not a DB token: provisioning is
  low-frequency and operator-controlled.

### H3 — User provisioning (`POST /api/admin/provision-user`)

System-key auth (H2). Body (Zod, in `packages/contracts`): `{ externalId:
string; name?: string; timezone?: string }`.

- If a `User` with that `externalId` exists → `200 { userId, alreadyExists:
  true }`. The personal token is minted **once** at creation and is not
  re-issued here.
- Otherwise → create the `User` **directly via Prisma**, bypassing the
  better-auth sign-up flow:
  - synthetic unique `email` (e.g. `mikoshi+<externalId>@bot.local`),
  - `emailVerified: true`,
  - **no `Account` row** — this is an API-only user that cannot password-login,
  - `name` (fallback to a placeholder), `timezone` (fallback to the app
    default).
  - Mint a personal token with the existing `generatePersonalApiToken` /
    `ApiToken` machinery (`apps/api/src/auth/api-token.ts`).
  - **Bypass** the `AppSettings.registrationEnabled` gate — this is an admin
    action, not public sign-up.
  - → `201 { userId, personalToken, alreadyExists: false }`.
- Companion: `POST /api/admin/provision-user/reset-token` `{ externalId }` →
  rotates and returns a fresh personal token (for when Mikoshi loses its copy).

### H4 — Member enrolment by `externalId` (`POST /api/admin/circles/:circleId/members`)

System-key auth (H2). Body `{ externalId: string }`. Resolves the `User` by
`externalId` (`404` if not provisioned), creates a `CircleMembership` with
`role: "member"` and the same `externalId` set. Idempotent: an existing
membership is returned, not duplicated. → `{ membershipId, userId, externalId }`.

Rationale: adding members is owner-only today (§C9). A bot-operated contest must
enrol participants without a human in the web UI. This admin route is the bot's
enrolment path. The **circle token cannot add members** — and must not, per §C2.

### H5 — Expose `externalId` in circle reads

`GET /api/circles/:circleId/members` already returns `externalId` (§C9). Ensure
`GET /api/circles/:circleId/leaderboard` also includes `externalId` per member,
so Mikoshi can map standings back to WhatsApp identities. Update the Zod
schemas in `packages/contracts/src/circles.ts` accordingly.

### H6 — Tests + OpenAPI

- Vitest in `apps/api`: provisioning creates an account-less, password-less user
  with a usable personal token; a second call with the same `externalId` is
  idempotent; reset-token rotates; member enrolment by `externalId` is
  idempotent and `404`s an unknown `externalId`; the system-key guard rejects a
  missing/wrong key (`401`) and `503`s when the env var is unset.
- Add the `/api/admin/*` routes to the OpenAPI definitions
  (`apps/api/src/plugins/openapi.ts`) with the system-key security scheme.
- No regression of the single-user flow, the circle-token denial matrix
  (§C14) or `@mikoshi-tracker/mcp`.

## What does NOT change

- The circle-token check-in endpoints (`/members/:userId/habits/...`) — Mikoshi's
  new design writes check-ins with each user's **personal** token against the
  existing `/api/today/*` endpoints, not the circle token. The circle token is
  used **read-only** for the leaderboard. The endpoints stay as-is.
- Habit sharing (`POST /api/circles/:id/shares`) stays self-service per member
  (personal token) — the member consents which habit competes.
- Circle models, circle tokens, the web GUI.

## Files

`prisma/schema.prisma`, `apps/api/src/auth/admin-key.ts` (new), a new
`apps/api/src/modules/admin/` module (or extend the existing
`/api/admin/registration` handler), `apps/api/src/server.ts` (route
registration), `apps/api/src/modules/circles/circle.routes.ts` +
`circle.service.ts` (H5), `packages/contracts/src/circles.ts`, `.env.example`,
`apps/api/src/plugins/openapi.ts`.

## Verification

- `pnpm prisma migrate dev` clean; `pnpm -r build` + workspace typecheck green
  after Prisma regen; `pnpm -r lint` green.
- `pnpm --filter @mikoshi-tracker/api test` green, including the new provisioning tests
  and the unchanged §C14 circle-token denial matrix.
- End to end: `provision-user` for a new `externalId` returns a personal token;
  that token works against `/api/today/*`; `provision-user` again is idempotent;
  `admin/circles/:id/members` enrols the user and the leaderboard shows their
  `externalId`.
- `pnpm test:e2e` and `pnpm verify:openclaw` green — no single-user / MCP
  regressions.
