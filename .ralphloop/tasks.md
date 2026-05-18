# tasks

Ordered checklist. Ralphloop picks the first `[ ]` task each iteration. Mark
done with `[x]`; blocked tasks the loop gives up on are marked `[!]`.

Feature: **Habit Circles** — the collaboration / social layer. Full design is
in `GOAL.md` ("Collaboration — Habit Circles") and `PLAN-CIRCLES.md`. Each task
below cites the plan section it implements. Do not duplicate check-in mutation
logic; reuse `apps/api/src/modules/checkins/checkin.service.ts`. Do not regress
the single-user flow or `@haaabit/mcp`.

## Phase 1 — Data model

- [ ] **01** Add Prisma models for circles — add `Circle`, `CircleMembership`,
      `CircleHabitShare`, `CircleToken` to `prisma/schema.prisma` exactly as
      specified in `PLAN-CIRCLES.md` §2, including the inverse relations on
      `User` (`circlesOwned Circle[] @relation("CircleOwner")`,
      `circleMemberships CircleMembership[]`) and `Habit`
      (`circleShares CircleHabitShare[]`). Run
      `pnpm prisma migrate dev --name add_circles`, regenerate the Prisma
      client into `apps/api/src/generated/prisma`, and confirm `apps/api`
      still builds.

## Phase 2 — Authorization primitives

- [ ] **02** Circle token module — create
      `apps/api/src/auth/circle-token.ts` mirroring `api-token.ts`:
      `generateCircleToken()` (prefix `haaabit_circle_`, 24 random bytes hex),
      `hashCircleToken()`, `createCircleToken()`, `findCircleByToken()`,
      `listCircleTokens()`, `revokeCircleToken()`. Plain token returned once.
      See `PLAN-CIRCLES.md` §3.
- [ ] **03** Circle auth boundary — create
      `apps/api/src/auth/circle-session.ts` with `CircleAuthError`,
      `CircleContext`, and `requireCircleContext(request, pathCircleId)`:
      missing Bearer → 401, unknown token → 401, token circle ≠ path circle →
      403. See `PLAN-CIRCLES.md` §4.

## Phase 3 — Circle-token REST surface

- [ ] **04** Circles module scaffold — create
      `apps/api/src/modules/circles/` with `circle.schema.ts`,
      `circle.repository.ts`, `circle.service.ts`, `circle.controller.ts`,
      `circle.routes.ts`, following the structure of `modules/habits/`. Register
      the routes in `apps/api/src/server.ts`. See `PLAN-CIRCLES.md` §5.
- [ ] **05** Authorization core — implement
      `assertCircleHabitWritable(circleId, userId, habitId)` in
      `circle.service.ts`: member-in-circle else 404, habit-belongs-to-user
      else 404, habit-active else 409 `HABIT_INACTIVE`, habit-shared-in-circle
      else 403. See `PLAN-CIRCLES.md` §5.2.
- [ ] **06** Circle check-in source — add `"circle"` to the `CheckInMutation`
      source enum in `apps/api/src/modules/checkins/checkin.schema.ts` and
      `packages/contracts/src/checkins.ts` (alongside `web`/`ai`/`system`).
      See `PLAN-CIRCLES.md` §5.3.
- [ ] **07** Circle read endpoints — implement circle-token-authenticated
      `GET /api/circles/:circleId/members`,
      `GET /api/circles/:circleId/leaderboard` (aggregated only over shared
      habits), and `GET /api/circles/:circleId/members/:userId/habits`
      (un-shared habits never appear). All start with `requireCircleContext`.
      See `PLAN-CIRCLES.md` §5.1.
- [ ] **08** Circle write endpoints — implement
      `POST /api/circles/:circleId/members/:userId/habits/:habitId/complete`,
      `.../set-total`, and `.../undo`. Each runs `assertCircleHabitWritable`
      then delegates to the existing `checkin.service` with the resolved
      `userId` and `source: "circle"`. See `PLAN-CIRCLES.md` §5.1–5.3.

## Phase 4 — Circle management REST surface (user session)

- [ ] **09** Circle lifecycle endpoints — implement session-authenticated
      `POST /api/circles` (creator becomes `owner` + first membership),
      `GET /api/circles` (circles the user belongs to), and
      `GET /api/circles/:circleId` (detail, member-only). See
      `PLAN-CIRCLES.md` §5.4.
- [ ] **10** Member management endpoints — implement owner-only
      `POST /api/circles/:circleId/members` (add by email),
      `PATCH /api/circles/:circleId/members/:membershipId` (edit `role`,
      `externalId`), `DELETE /api/circles/:circleId/members/:membershipId`.
      See `PLAN-CIRCLES.md` §5.4–5.5.
- [ ] **11** Habit-share endpoints — implement member endpoints
      `POST /api/circles/:circleId/shares` (`{ habitId }`, verifies the habit
      belongs to the session user) and
      `DELETE /api/circles/:circleId/shares/:habitId`. See `PLAN-CIRCLES.md`
      §5.4.
- [ ] **12** Circle token endpoints — implement owner-only
      `POST /api/circles/:circleId/tokens` (returns plain token once),
      `GET /api/circles/:circleId/tokens` (metadata only),
      `DELETE /api/circles/:circleId/tokens/:tokenId`. See `PLAN-CIRCLES.md`
      §5.4.

## Phase 5 — Core security tests

- [ ] **13** Circle-token denial matrix — Vitest in `apps/api` covering
      `PLAN-CIRCLES.md` §9: cross-circle token → 403, non-member write → 404,
      foreign habit → 404, un-shared habit → 403, archived habit → 409,
      happy-path check-in producing `CheckInMutation` with `source: "circle"`
      reflected in the leaderboard, and `GET /members/:userId/habits` never
      leaking un-shared habits. Plus `circle-token` hash/lookup and
      `requireCircleContext` (absent/unknown/cross token) unit tests.
- [ ] **14** Management authorization tests — Vitest covering `PLAN-CIRCLES.md`
      §9.8: non-owner gets 403 minting a token or adding a member; a member
      cannot share a habit that is not theirs (403/404).

## Phase 6 — Shared contracts + OpenAPI

- [ ] **15** Circle contracts — create `packages/contracts/src/circles.ts`
      with the input/output Zod schemas + types for every circle endpoint,
      exported consistently with `habits.ts`/`today.ts`. Wire it into the
      package index.
- [ ] **16** OpenAPI + docs — add `circleApiRouteDefinitions` in
      `circle.routes.ts`, register them in
      `apps/api/src/plugins/openapi.ts`, add a `CircleBearerAuth` security
      scheme (or extend `BearerAuth`), and surface a "Circles" section in
      `/api/docs`. See `PLAN-CIRCLES.md` §6.

## Phase 7 — Web GUI (consistent with the Haaabit design system)

> The Circles UI must be a first-class, consistent part of the app — same
> visual language as auth/dashboard/habits per `CLAUDE.md` (light-mode-first,
> calm, typographic hierarchy, CSS Modules, Radix dialogs). It reuses existing
> `components/ui/` primitives; no new styling system. Empty/loading/error
> states, responsive layout, and en/zh i18n are required, not optional.

- [ ] **17** Circles navigation + data layer — add a "Circles" entry to the
      `(app)` navigation and a typed API client wrapper in `apps/web` for the
      circle endpoints, consuming `packages/contracts/src/circles.ts`.
- [ ] **18** Circles list page — `(app)/circles` route: list circles the user
      belongs to, with a "Create circle" flow (Radix dialog), reusing existing
      UI primitives and matching the habits-list visual language. Include the
      empty state.
- [ ] **19** Circle detail page — `(app)/circles/[circleId]` route: members
      list and leaderboard, styled consistently with the dashboard's metrics
      and ranking presentation.
- [ ] **20** Habit-share controls — on the circle detail page, render the
      current user's own habits with a "share in this circle" toggle wired to
      the share/unshare endpoints; reflect shared state immediately.
- [ ] **21** Owner management UI — owner-only panel on the circle detail page:
      add/remove members, edit `externalId`, and mint/list/revoke circle
      tokens (show the plain token exactly once, with a copy affordance and a
      warning). Consistent with the `api-access` panel's treatment of secrets.
- [ ] **22** Circles UX polish — verify and complete loading/empty/error
      states, responsive behavior, and English/Chinese strings across every
      Circles screen so the section is indistinguishable in polish from the
      rest of the app.

## Phase 8 — Final verification

- [ ] **23** Full acceptance pass — confirm `PLAN-CIRCLES.md` §10: `pnpm -r
      build` and workspace typecheck green after Prisma regen, `pnpm -r lint`
      green, `pnpm --filter @haaabit/api test` green (incl. the denial
      matrix), `pnpm test:e2e` and `pnpm verify:openclaw` green with no
      single-user / `@haaabit/mcp` regressions. Fix anything outstanding, then
      write `TASK_COMPLETE` on its own line in `progress.md`.
