import type { ReactNode } from "react";

import { Button, PageFrame, StatePanel } from "../../components/ui";
import { isNotFound } from "../../lib/http";
import { useLocale } from "../../components/locale";
import NotFoundPage from "../pages/not-found";
import { RefreshContext, type PageDataState } from "./use-page-data";

type PageBoundaryProps<T> = {
  state: PageDataState<T>;
  /** Shown while the FIRST load is in flight (no data yet). */
  skeleton?: ReactNode;
  /** Render a NotFound page when the fetch failed with a 404. */
  notFoundOn404?: boolean;
  children: (data: T) => ReactNode;
};

/**
 * Shared shell around usePageData consumers. It owns the three states every
 * page used to hand-roll (and got subtly wrong):
 * - error → a visible error panel with retry, instead of a silent blank page;
 *   404s optionally render the NotFound page (so 5xx is never conflated with
 *   "does not exist").
 * - no data yet → skeleton. Checked AFTER error and on `data`, not `loading`,
 *   so a refresh() keeps the current page mounted (no skeleton flash, open
 *   dialogs survive) while new data loads.
 * - data → children inside RefreshContext, so nested components can re-pull
 *   the page after a mutation.
 */
export function PageBoundary<T>({ state, skeleton, notFoundOn404, children }: PageBoundaryProps<T>) {
  const { copy } = useLocale();

  if (state.error) {
    if (notFoundOn404 && isNotFound(state.error)) {
      return <NotFoundPage />;
    }
    return (
      <PageFrame>
        <StatePanel
          tone="danger"
          eyebrow={copy.shared.pageLoadError.eyebrow}
          title={copy.shared.pageLoadError.title}
          description={copy.shared.pageLoadError.description}
          testId="page-load-error"
          actions={
            <Button type="button" onClick={state.refresh}>
              {copy.shared.pageLoadError.retry}
            </Button>
          }
        />
      </PageFrame>
    );
  }

  if (state.data === null) {
    return <>{skeleton ?? null}</>;
  }

  return <RefreshContext.Provider value={state.refresh}>{children(state.data)}</RefreshContext.Provider>;
}
