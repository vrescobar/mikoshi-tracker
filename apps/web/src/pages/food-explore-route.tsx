import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import { Suspense, lazy, useState } from "react";

import { FoodSearchBox } from "../../components/food/food-search-box";
import { RepeatsPanel } from "../../components/food/RepeatsPanel";
import { useLocale } from "../../components/locale";
import { SkeletonBlock, Surface } from "../../components/ui";
import { shiftDays, todayKeyInTimeZone } from "../../lib/dates";
import { getRepeatedFoodMeals } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";
import styles from "./food-explore-route.module.css";

const FoodInsightsRoute = lazy(() => import("./food-insights-route"));

/**
 * Diet "Explore" tab: the search-and-exploration surface — fuzzy re-log search,
 * favourites (repeats), and the full history/trends view. Moved off the Today
 * tab so Today stays a focused at-a-glance summary.
 */
export default function FoodExploreRoute() {
  const { timezone } = useSession();
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const today = todayKeyInTimeZone(timezone);
  const from30 = shiftDays(today, -30);
  const [reloadKey, setReloadKey] = useState(0);

  const state = usePageData<{ repeats: AggregationResponse | null }>(async () => {
    const repeats = await getRepeatedFoodMeals(from30, today, 8).catch(() => null);
    return { repeats };
  }, [today, timezone, reloadKey]);

  return (
    <div className={styles.page} data-testid="food-explore-page">
      <header className={styles.intro}>
        <h2 className={styles.title}>{copy.explore.title}</h2>
        <p className={styles.description}>{copy.explore.description}</p>
      </header>

      <section className={styles.section} aria-label={copy.explore.searchTitle}>
        <h3 className={styles.sectionTitle}>{copy.explore.searchTitle}</h3>
        <FoodSearchBox onLogged={() => setReloadKey((k) => k + 1)} />
      </section>

      <section className={styles.section} aria-label={copy.explore.historyTitle}>
        <h3 className={styles.sectionTitle}>{copy.explore.historyTitle}</h3>
        <Surface variant="panel" padding="md">
          <Suspense fallback={<SkeletonBlock height="16rem" />}>
            <FoodInsightsRoute embedded />
          </Suspense>
        </Surface>
      </section>

      <section className={styles.section} aria-label={copy.explore.favoritesTitle}>
        <h3 className={styles.sectionTitle}>{copy.explore.favoritesTitle}</h3>
        <PageBoundary state={state}>
          {(data) => (
            <RepeatsPanel
              aggregations={data.repeats}
              copy={{
                title: copy.page.repeats.title,
                description: copy.page.repeats.description,
                empty: copy.page.repeats.empty,
                logAgain: copy.page.repeats.logAgain,
                logging: copy.page.repeats.logging,
                errorTitle: copy.page.repeats.errorTitle,
                countLabel: (count) => `${count}×`,
                variantsLabel: copy.page.repeats.variantsLabel,
              }}
              onLogged={() => setReloadKey((k) => k + 1)}
            />
          )}
        </PageBoundary>
      </section>
    </div>
  );
}
