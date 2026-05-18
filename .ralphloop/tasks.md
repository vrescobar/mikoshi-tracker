# tasks

Ordered checklist. Ralphloop picks the first `[ ]` task each iteration. Mark
done with `[x]`; blocked tasks the loop gives up on are marked `[!]`.

Feature: **Habit Circles** — the collaboration / social layer. The full,
self-contained spec is `GOAL.md` → "Collaboration — Habit Circles"; each task
cites the `§C…` subsection it implements. Do not duplicate check-in mutation
logic; reuse `apps/api/src/modules/checkins/checkin.service.ts`. Do not regress
the single-user flow or `@haaabit/mcp`.

## Phase 4 — Circle-token REST surface

- [x] **05** Circles module scaffold — create
      `apps/api/src/modules/circles/` with `circle.schema.ts`,
      `circle.repository.ts`, `circle.service.ts`, `circle.controller.ts`,
      `circle.routes.ts`, following the structure of `modules/habits/`. Reuse
      the contracts from task 02. Register the routes in
      `apps/api/src/server.ts`. See `GOAL.md` §C7.
- [x] **06** Authorization core — implement
      `assertCircleHabitWritable(circleId, userId, habitId)` in
      `circle.service.ts`: member-in-circle else 404, habit-belongs-to-user
      else 404, habit-active else 409 `HABIT_INACTIVE`, habit-shared-in-circle
      else 403. See `GOAL.md` §C8.
- [x] **07** Circle check-in source — add `"circle"` to the `CheckInMutation`
      source enum in `apps/api/src/modules/checkins/checkin.schema.ts` and
      `packages/contracts/src/checkins.ts` (alongside `web`/`ai`/`system`).
      See `GOAL.md` §C9.
- [x] **08** Circle read endpoints — implement circle-token-authenticated
      `GET /api/circles/:circleId/members`,
      `GET /api/circles/:circleId/leaderboard` (aggregated only over shared
      habits), and `GET /api/circles/:circleId/members/:userId/habits`
      (un-shared habits never appear). All start with `requireCircleContext`.
      See `GOAL.md` §C9.
- [x] **09** Circle write endpoints — implement
      `POST /api/circles/:circleId/members/:userId/habits/:habitId/complete`,
      `.../set-total`, and `.../undo`. Each runs `assertCircleHabitWritable`
      then delegates to the existing `checkin.service` with the resolved
      `userId` and `source: "circle"`. `undo` reverts **only** the day's
      latest mutation whose `source` is `"circle"`; if the latest is `web`/`ai`
      it returns `409 UNDO_NOT_CIRCLE_SOURCED` and mutates nothing. See
      `GOAL.md` §C8–§C9.

## Phase 5 — Circle management REST surface (user session)

- [ ] **10** Circle lifecycle endpoints — implement session-authenticated
      `POST /api/circles` (creator becomes `owner` + first membership),
      `GET /api/circles` (circles the user belongs to), and
      `GET /api/circles/:circleId` (detail, member-only). See `GOAL.md` §C9.
- [ ] **11** Member management endpoints — implement owner-only
      `POST /api/circles/:circleId/members` (add by email),
      `PATCH /api/circles/:circleId/members/:membershipId` (edit `role`,
      `externalId`), `DELETE /api/circles/:circleId/members/:membershipId`.
      See `GOAL.md` §C9–§C10.
- [ ] **12** Habit-share endpoints — implement member endpoints
      `POST /api/circles/:circleId/shares` (`{ habitId }`, verifies the habit
      belongs to the session user) and
      `DELETE /api/circles/:circleId/shares/:habitId`. See `GOAL.md` §C9.
- [ ] **13** Circle token endpoints — implement owner-only
      `POST /api/circles/:circleId/tokens` (returns plain token once),
      `GET /api/circles/:circleId/tokens` (metadata only),
      `DELETE /api/circles/:circleId/tokens/:tokenId`. See `GOAL.md` §C9.

## Phase 6 — Core security tests

- [ ] **14** Circle-token denial matrix — Vitest in `apps/api` covering
      `GOAL.md` §C14: cross-circle token → 403, non-member write → 404,
      foreign habit → 404, un-shared habit → 403, archived habit → 409,
      happy-path check-in producing `CheckInMutation` with `source: "circle"`
      reflected in the leaderboard, `GET /members/:userId/habits` never
      leaking un-shared habits, and the `undo` scope rule (§C14.9): circle
      `undo` over a `web`/`ai` mutation → `409 UNDO_NOT_CIRCLE_SOURCED` with
      the user's mutation untouched. Plus `circle-token` hash/lookup and
      `requireCircleContext` (absent/unknown/cross token) unit tests.
- [ ] **15** Management authorization tests — Vitest covering `GOAL.md`
      §C14.8: non-owner gets 403 minting a token or adding a member; a member
      cannot share a habit that is not theirs (403/404).

## Phase 7 — OpenAPI

- [ ] **16** OpenAPI + docs — add `circleApiRouteDefinitions` in
      `circle.routes.ts`, register them in
      `apps/api/src/plugins/openapi.ts`, add a `CircleBearerAuth` security
      scheme (or extend `BearerAuth`), and surface a "Circles" section in
      `/api/docs`. See `GOAL.md` §C11.

## Phase 8 — Web GUI (consistent + explanatory)

> The Circles UI is a first-class, consistent part of the app — same visual
> language as auth/dashboard/habits per `CLAUDE.md` (light-mode-first, calm,
> typographic hierarchy, CSS Modules, Radix dialogs), reusing existing
> `components/ui/` primitives. The UI must also be **explanatory**: every
> option that shares data or grants access states, in plain language, what it
> does and its consequences before the user acts (`GOAL.md` §C12).
> Empty/loading/error states and responsive layout are required.

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
- [ ] **22** Explanatory copy — for every Circles action that shares data or
      grants access (share a habit, mint a circle token, edit `externalId`,
      remove a member / unshare), add visible plain-language copy explaining
      what it does and its consequences, per `GOAL.md` §C12. Copy is added as
      i18n strings (English + Chinese) so task 24 can translate it.
- [ ] **23** Circles UX polish — verify and complete loading/empty/error
      states and responsive behavior across every Circles screen so the
      section is indistinguishable in polish from the rest of the app.

## Phase 9 — Internationalization (Spanish)

- [ ] **24** Spanish translation of the whole GUI — add a Spanish (`es`)
      locale to `apps/web` and translate **every** screen: the existing auth,
      dashboard, habits, habit-detail and api-access surfaces *and* the new
      Circles section, including all explanatory copy from task 22. Wire `es`
      into the language switcher and browser language detection so the app is
      trilingual `en` / `zh` / `es` with no untranslated strings.
      See `GOAL.md` §C13.

## Phase 10 — Final verification

- [ ] **25** Full acceptance pass — confirm `GOAL.md` §C15: `pnpm -r build`
      and workspace typecheck green after Prisma regen, `pnpm -r lint` green,
      `pnpm --filter @haaabit/api test` green (incl. the denial matrix and
      undo-scope test), `pnpm test:e2e` and `pnpm verify:openclaw` green with
      no single-user / `@haaabit/mcp` regressions, the Circles web section
      complete and explanatory, and the whole GUI translated to
      `en` / `zh` / `es`. Fix anything outstanding, then write `TASK_COMPLETE`
      on its own line in `progress.md`.
