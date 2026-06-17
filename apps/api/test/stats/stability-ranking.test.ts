import { afterEach, describe, expect, it } from "bun:test";

import { createHabit } from "../../src/modules/habits/habit.service";
import { getOverviewStats } from "../../src/modules/stats/stats.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";
import { seedHabitDayStates } from "../helpers/habits";

async function createOwnedHabit(
  context: TestContext,
  userId: string,
  input: Parameters<typeof createHabit>[1]["input"],
) {
  return createHabit(
    {
      db: context.app.db,
    },
    {
      userId,
      input,
      today: "2026-03-01",
    },
  );
}

describe("stability ranking", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("ranks only active habits by recent completion rate", async () => {
    context = await createTestContext();
    const { body } = await signUp(context.app);

    const topHabit = await createOwnedHabit(context, body.user.id, {
      name: "Top habit",
      frequency: {
        type: "daily",
      },
      startDate: "2026-03-05",
    });

    const middleHabit = await createOwnedHabit(context, body.user.id, {
      name: "Middle habit",
      frequency: {
        type: "daily",
      },
      startDate: "2026-03-05",
    });

    const bottomHabit = await createOwnedHabit(context, body.user.id, {
      name: "Bottom habit",
      frequency: {
        type: "daily",
      },
      startDate: "2026-03-05",
    });

    const archivedHabit = await createOwnedHabit(context, body.user.id, {
      name: "Archived winner",
      frequency: {
        type: "daily",
      },
      startDate: "2026-03-05",
    });

    await context.app.db.entry.update({
      where: {
        id: archivedHabit.id,
      },
      data: {
        isActive: false,
      },
    });

    await seedHabitDayStates(context.app.db, [
        { habitId: topHabit.id, dateKey: "2026-03-05", completed: true },
        { habitId: topHabit.id, dateKey: "2026-03-06", completed: true },
        { habitId: topHabit.id, dateKey: "2026-03-07", completed: true },
        { habitId: topHabit.id, dateKey: "2026-03-08", completed: true },
        { habitId: topHabit.id, dateKey: "2026-03-09", completed: true },
        { habitId: middleHabit.id, dateKey: "2026-03-05", completed: true },
        { habitId: middleHabit.id, dateKey: "2026-03-06", completed: true },
        { habitId: middleHabit.id, dateKey: "2026-03-08", completed: true },
        { habitId: bottomHabit.id, dateKey: "2026-03-05", completed: true },
        { habitId: archivedHabit.id, dateKey: "2026-03-05", completed: true },
        { habitId: archivedHabit.id, dateKey: "2026-03-06", completed: true },
        { habitId: archivedHabit.id, dateKey: "2026-03-07", completed: true },
        { habitId: archivedHabit.id, dateKey: "2026-03-08", completed: true },
        { habitId: archivedHabit.id, dateKey: "2026-03-09", completed: true },
      ]);

    const overview = await getOverviewStats(
      {
        db: context.app.db,
      },
      {
        userId: body.user.id,
        timestamp: "2026-03-09T12:00:00.000Z",
      },
    );

    expect(overview.stabilityRanking.map((entry) => entry.name)).toEqual(["Top habit", "Middle habit", "Bottom habit"]);
    expect(overview.stabilityRanking.map((entry) => entry.completionRate)).toEqual([1, 0.6, 0.2]);
  });
});
