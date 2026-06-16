import { HabitsOverviewPage, type HabitOverviewRow } from "../../components/habits/habits-overview-page";
import { getHabitDetail, listHabits } from "../../lib/auth-client";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

/**
 * Habits overview: every active habit with its 7-day compliance strip and a
 * frequency-aware streak badge. Fetches the habit list, then each habit's
 * detail (for last7Days + streak stats) in parallel. A failed detail degrades
 * to a metadata-only row rather than failing the whole page.
 */
export default function HabitsOverviewRoute() {
  const state = usePageData<{ rows: HabitOverviewRow[] }>(async () => {
    const habits = await listHabits({ status: "active" });
    const rows = await Promise.all(
      habits.map(async (habit) => ({
        habit,
        detail: await getHabitDetail(habit.id).catch(() => null),
      })),
    );
    return { rows };
  }, []);

  return (
    <PageBoundary state={state}>{(data) => <HabitsOverviewPage rows={data.rows} />}</PageBoundary>
  );
}
