import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import { useRefresh } from "../../src/lib/use-page-data";
import { useState } from "react";

import { ProposalDialog } from "../ai/ProposalDialog";
import { FoodTodayPanel } from "./food-today-panel";

type Props = {
  aggregations: AggregationResponse | null;
  foodEntryId?: string | null;
  dailyKcalTarget?: number | null;
};

/**
 * Phase 13 G-DASH-2 + G-DASH-3: the FoodTodayPanel becomes interactive when
 * wrapped in this section. The `+` button opens the ProposalDialog without
 * navigating away from the dashboard. After save we trigger the page refresh
 * so the server component re-fetches aggregations. The dailyKcalTarget is
 * forwarded so the panel can show + edit it inline.
 */
export function DashboardFoodSection({
  aggregations,
  foodEntryId = null,
  dailyKcalTarget = null,
}: Props) {
  const refresh = useRefresh();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <FoodTodayPanel
        aggregations={aggregations}
        onQuickAdd={() => setIsOpen(true)}
        foodEntryId={foodEntryId}
        dailyKcalTarget={dailyKcalTarget}
        onTargetSaved={() => refresh()}
      />
      <ProposalDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onCreated={() => {
          setIsOpen(false);
          refresh();
        }}
      />
    </>
  );
}
