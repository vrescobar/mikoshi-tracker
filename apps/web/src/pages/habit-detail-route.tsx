import { useParams } from "react-router";

import type { HabitDetail } from "@mikoshi-tracker/contracts/habits";

import { HabitDetailPage } from "../../components/habits/habit-detail-page";
import { getHabitDetail } from "../../lib/auth-client";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

/** Habit detail: 30-day heatmap, streak stats, history, and settings. 404 → NotFound. */
export default function HabitDetailRoute() {
  const { habitId = "" } = useParams<{ habitId: string }>();

  const state = usePageData<HabitDetail>(() => getHabitDetail(habitId), [habitId]);

  return (
    <PageBoundary state={state} notFoundOn404>
      {(detail) => <HabitDetailPage detail={detail} />}
    </PageBoundary>
  );
}
