import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Replacement for Next's `router.refresh()`: each page provides its data
 * hook's refresh function, so deep components can re-pull the page data
 * after a mutation.
 */
export const RefreshContext = createContext<() => void>(() => {});

export function useRefresh(): () => void {
  return useContext(RefreshContext);
}

export type PageDataState<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};

/**
 * Page-level data fetching with the loading/skeleton semantics the Next
 * server pages + loading.tsx files had: `loading` is true until the fetcher
 * settles, and changing any dep (e.g. a search param) re-fetches.
 *
 * `deps` must be primitive values (strings/numbers/booleans) — passing a
 * fresh object/URLSearchParams identity each render would loop.
 */
export function usePageData<T>(
  fetcher: () => Promise<T>,
  deps: readonly (string | number | boolean | null | undefined)[],
): PageDataState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetcher().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: error as Error });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the page's declared primitive inputs; fetcher identity is intentionally ignored
  }, [...deps, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  return { ...state, refresh };
}
