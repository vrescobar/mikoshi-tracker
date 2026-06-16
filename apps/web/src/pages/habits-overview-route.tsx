import { HabitsPage } from "../../components/habits/habits-page";

/**
 * Habits hub: tabbed Overview (weekly compliance + frequency-aware streaks),
 * All activity (the generic entries log filtered to habits), and Archived.
 * Each tab loads its own data when activated.
 */
export default function HabitsOverviewRoute() {
  return <HabitsPage />;
}
