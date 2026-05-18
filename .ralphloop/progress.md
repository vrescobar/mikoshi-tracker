# progress

Append-only decision log. The agent writes one short bullet per task here
under "Notes per task". When every task is checked off, the agent writes the
literal `TASK_COMPLETE` on a line by itself at the bottom of this file and
the loop halts.

## Notes per task

- **02** Created `packages/contracts/src/circles.ts` with Zod schemas and TypeScript types for every circle endpoint (both circle-token and session-authenticated surfaces from §C9): domain shapes (`circleRecordSchema`, `circleMemberSchema`, `circleTokenMetaSchema`), path-param schemas, all input schemas (`createCircleInputSchema`, `addCircleMemberInputSchema`, `updateCircleMemberInputSchema`, `shareHabitInputSchema`, `createCircleTokenInputSchema`, `circleSetTotalInputSchema`), and response schemas for every endpoint. Wired the export into `packages/contracts/package.json` as `"./circles"`. Exported `circleErrorCodeSchema` with `HABIT_INACTIVE` and `UNDO_NOT_CIRCLE_SOURCED` for use by later API tasks. Used `isoDateTimeSchema` (ISO string) directly rather than `z.date()` since these schemas serve the API wire boundary; used `z.strictObject` for update inputs consistent with `editableHabitFieldsSchema` in `habits.ts`.
- **01** Added `Circle`, `CircleMembership`, `CircleHabitShare`, `CircleToken` to `prisma/schema.prisma` with inverse relations on `User` (`circlesOwned`, `circleMemberships`) and `Habit` (`circleShares`); ran `migrate dev --name add_circles` (migration `20260518132529_add_circles`), regenerated client, `apps/api` builds clean. Root cause of 4 prior attempt failures: (a) dev.db retained stale Circle tables + migration entry across git resets since it's gitignored — fixed by dropping those tables and the `_prisma_migrations` entry before re-running migrate dev each attempt; (b) pre-existing test timeout bug: `createTestContext()` calls `execFileSync("pnpm exec prisma db push")` which blocks the worker thread for >5 s, exceeding vitest's 5000 ms default timeout — fixed by adding `testTimeout: 30000` to `apps/api/vitest.config.ts`.
