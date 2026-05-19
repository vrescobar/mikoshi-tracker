# tasks

Ordered checklist. Ralphloop picks the first `[ ]` task each iteration. Mark
done with `[x]`; blocked tasks the loop gives up on are marked `[!]`.

Feature: **Habit Circles** — the collaboration / social layer. The full,
self-contained spec is `GOAL.md` → "Collaboration — Habit Circles"; each task
cites the `§C…` subsection it implements. Do not duplicate check-in mutation
logic; reuse `apps/api/src/modules/checkins/checkin.service.ts`. Do not regress
the single-user flow or `@haaabit/mcp`.

## Phase 11 — External provisioning for bot-operated circles

Additive layer so an external agent (Mikoshi) can run a circle as a contest
where each participant's check-ins are written with that participant's **own
personal token**. Full plan in `PLAN.md`; self-contained spec in `GOAL.md`
§C17. Changes nothing in §C1–§C16. Do not regress the single-user flow,
`@haaabit/mcp`, or the §C14 circle-token denial matrix. Marker:
`PHASE_11_COMPLETE` (written by task 31), not the generic `TASK_COMPLETE`.

- [x] **26** `User.externalId` — add `externalId String? @unique` to the `User`
      model in `prisma/schema.prisma` (an opaque integration id; Haaabit does
      not know it is a WhatsApp identity). Run
      `pnpm prisma migrate dev --name add_user_external_id`, regenerate the
      Prisma client, confirm `apps/api` builds. See `GOAL.md` §C17.1.

- [x] **27** System-key auth — new `apps/api/src/auth/admin-key.ts`: a Fastify
      guard/preHandler that validates `Authorization: Bearer <key>` against the
      env var `HAAABIT_ADMIN_API_KEY` with a **timing-safe** compare
      (`crypto.timingSafeEqual`). Missing/wrong key → `401`; env var unset →
      the `/api/admin/*` provisioning routes respond `503` (feature disabled).
      Distinct from sessions, `ApiToken`s, circle tokens and the `User.isAdmin`
      role. Document `HAAABIT_ADMIN_API_KEY` in `.env.example`. Unit tests for
      the guard (absent / wrong / unset). See `GOAL.md` §C17.2.

- [x] **28** User provisioning endpoint — `POST /api/admin/provision-user`
      (system-key auth), in a new `apps/api/src/modules/admin/` module
      registered in `apps/api/src/server.ts`. Body `{ externalId, name?,
      timezone? }` (Zod in `packages/contracts`). Existing `externalId` →
      `200 { userId, alreadyExists: true }`. New → create the `User` directly
      via Prisma (synthetic unique `email`, `emailVerified: true`, **no
      `Account` row**, default `timezone`), mint a personal token via the
      existing `generatePersonalApiToken` / `ApiToken` machinery, **bypass** the
      `AppSettings.registrationEnabled` gate → `201 { userId, personalToken,
      alreadyExists: false }`. Add companion `POST
      /api/admin/provision-user/reset-token` `{ externalId }` that rotates the
      token. See `GOAL.md` §C17.3.

- [x] **29** Member enrolment by `externalId` — `POST
      /api/admin/circles/:circleId/members` (system-key auth). Body
      `{ externalId }`: resolve the `User` by `externalId` (`404` if not
      provisioned), create a `CircleMembership` (`role: "member"`, `externalId`
      set); idempotent — an existing membership is returned, not duplicated.
      → `{ membershipId, userId, externalId }`. The circle token still cannot
      add members. See `GOAL.md` §C17.4.

- [x] **30** Expose `externalId` in circle reads — ensure
      `GET /api/circles/:circleId/leaderboard` includes `externalId` per member
      (like `GET .../members` already does, §C9). Update the Zod schemas in
      `packages/contracts/src/circles.ts` and `circle.service.ts`/repository as
      needed. See `GOAL.md` §C17.5.

- [ ] **31** Tests, OpenAPI + Phase 11 acceptance — Vitest in `apps/api`:
      provisioning creates an account-less, password-less user with a usable
      personal token; a repeat call with the same `externalId` is idempotent;
      reset-token rotates; member enrolment by `externalId` is idempotent and
      `404`s an unknown id; the system-key guard rejects missing/wrong keys and
      `503`s when unset. Add the `/api/admin/*` routes to the OpenAPI
      definitions (`apps/api/src/plugins/openapi.ts`) with the system-key
      security scheme. Confirm no regression of the single-user flow, the §C14
      denial matrix, or `@haaabit/mcp`. `pnpm -r build` / typecheck / `pnpm -r
      lint` / `pnpm --filter @haaabit/api test` green. Write `PHASE_11_COMPLETE`
      on its own line in `progress.md`.
