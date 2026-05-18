# progress

Append-only decision log. The agent writes one short bullet per task here
under "Notes per task". When every task is checked off, the agent writes the
literal `TASK_COMPLETE` on a line by itself at the bottom of this file and
the loop halts.

## Notes per task

- **01** Added `Circle`, `CircleMembership`, `CircleHabitShare`, `CircleToken` to `prisma/schema.prisma` with inverse relations on `User` (`circlesOwned`, `circleMemberships`) and `Habit` (`circleShares`); ran `migrate dev --name add_circles` (migration `20260518132529_add_circles`), regenerated client, `apps/api` builds clean. Root cause of 4 prior attempt failures: (a) dev.db retained stale Circle tables + migration entry across git resets since it's gitignored — fixed by dropping those tables and the `_prisma_migrations` entry before re-running migrate dev each attempt; (b) pre-existing test timeout bug: `createTestContext()` calls `execFileSync("pnpm exec prisma db push")` which blocks the worker thread for >5 s, exceeding vitest's 5000 ms default timeout — fixed by adding `testTimeout: 30000` to `apps/api/vitest.config.ts`.
