import { afterEach, describe, expect, it } from "vitest";

import {
  completeHabitForToday,
  setHabitTotalForToday,
  undoHabitForToday,
} from "../../src/modules/checkins/checkin.service";
import { createHabit } from "../../src/modules/habits/habit.service";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

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
      today: "2026-03-07",
    },
  );
}

describe("checkin history", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("records provenance for complete, set-total, and undo mutations", async () => {
    context = await createTestContext();
    const { body } = await signUp(context.app);
    const habit = await createOwnedHabit(context, body.user.id, {
      name: "Read",
      kind: "quantity",
      targetValue: 30,
      unit: "minutes",
      frequency: {
        type: "daily",
      },
    });

    await setHabitTotalForToday(
      {
        db: context.app.db,
      },
      {
        userId: body.user.id,
        habitId: habit.id,
        total: 15,
        source: "web",
        note: "morning session",
        timestamp: "2026-03-11T08:00:00.000Z",
      },
    );

    await setHabitTotalForToday(
      {
        db: context.app.db,
      },
      {
        userId: body.user.id,
        habitId: habit.id,
        total: 30,
        source: "ai",
        note: null,
        timestamp: "2026-03-11T12:00:00.000Z",
      },
    );

    await undoHabitForToday(
      {
        db: context.app.db,
      },
      {
        userId: body.user.id,
        habitId: habit.id,
        source: "web",
        note: "undo the later change",
        timestamp: "2026-03-11T12:05:00.000Z",
      },
    );

    // Provenance now lives in EventMutation. Recurring habit writes map to
    // CREATE → UPDATE → UNDO with previous/next state captured in the payloads.
    const mutations = await context.app.db.eventMutation.findMany({
      where: {
        entryId: habit.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(mutations).toHaveLength(3);
    expect(
      mutations.map((mutation) => ({
        type: mutation.type,
        dateKey: mutation.dateKey,
        source: mutation.source,
        note: mutation.note,
        previousPayload: mutation.previousPayload ? JSON.parse(mutation.previousPayload) : null,
        nextPayload: mutation.nextPayload ? JSON.parse(mutation.nextPayload) : null,
        createdAt: mutation.createdAt instanceof Date,
      })),
    ).toEqual([
      {
        type: "CREATE",
        dateKey: "2026-03-11",
        source: "WEB",
        note: "morning session",
        previousPayload: null,
        nextPayload: { value: 15, completed: false },
        createdAt: true,
      },
      {
        type: "UPDATE",
        dateKey: "2026-03-11",
        source: "AI",
        note: null,
        previousPayload: { value: 15, completed: false },
        nextPayload: { value: 30, completed: true },
        createdAt: true,
      },
      {
        type: "UNDO",
        dateKey: "2026-03-11",
        source: "WEB",
        note: "undo the later change",
        previousPayload: { value: 30, completed: true },
        nextPayload: { value: 15, completed: false },
        createdAt: true,
      },
    ]);
  });

  it("records boolean completion provenance with the current business day", async () => {
    context = await createTestContext();
    const { body } = await signUp(context.app);
    const habit = await createOwnedHabit(context, body.user.id, {
      name: "Meditate",
      frequency: {
        type: "daily",
      },
    });

    await completeHabitForToday(
      {
        db: context.app.db,
      },
      {
        userId: body.user.id,
        habitId: habit.id,
        source: "web",
        note: "completed after lunch",
        timestamp: "2026-03-11T12:30:00.000Z",
      },
    );

    const mutation = await context.app.db.eventMutation.findFirstOrThrow({
      where: {
        entryId: habit.id,
      },
    });

    expect(mutation).toMatchObject({
      type: "CREATE",
      source: "WEB",
      note: "completed after lunch",
      dateKey: "2026-03-11",
    });
    expect(mutation.previousPayload).toBeNull();
    expect(JSON.parse(mutation.nextPayload ?? "null")).toEqual({ completed: true });
  });
});
