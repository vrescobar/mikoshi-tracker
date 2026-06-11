import { useSearchParams } from "react-router";
import { useCallback, useMemo } from "react";

import type { EntryTypeRecord } from "../../lib/entries-client";

import styles from "./entry-type-filter.module.css";

export type EntryTypeFilterCopy = {
  /** "Show" / "显示" / "Mostrar" */
  label: string;
  /** "All types" / "全部" / "Todos" */
  all: string;
  /** Display label for each known slug. Missing slugs fall back to the type's name. */
  slugs: Partial<Record<string, string>>;
};

type Props = {
  entryTypes: EntryTypeRecord[];
  copy: EntryTypeFilterCopy;
};

function parseSelectedSlugs(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function EntryTypeFilter({ entryTypes, copy }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlugs = useMemo(
    () => parseSelectedSlugs(searchParams.get("entryTypeSlug")),
    [searchParams],
  );

  const writeSelection = useCallback(
    (next: Set<string>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.size === 0) {
        params.delete("entryTypeSlug");
      } else {
        params.set(
          "entryTypeSlug",
          Array.from(next)
            .sort((a, b) => a.localeCompare(b))
            .join(","),
        );
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const toggleSlug = useCallback(
    (slug: string) => {
      const next = new Set(selectedSlugs);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      writeSelection(next);
    },
    [selectedSlugs, writeSelection],
  );

  const clearAll = useCallback(() => writeSelection(new Set()), [writeSelection]);

  return (
    <div className={styles.row} role="tablist" aria-label={copy.label} data-testid="entry-type-filter">
      <span className={styles.label}>{copy.label}</span>
      <button
        type="button"
        role="tab"
        aria-selected={selectedSlugs.size === 0}
        className={`${styles.chip} ${selectedSlugs.size === 0 ? styles.chipActive : ""}`}
        onClick={clearAll}
        data-testid="entry-type-filter-all"
      >
        {copy.all}
      </button>
      {entryTypes.map((type) => {
        const active = selectedSlugs.has(type.slug);
        const label = copy.slugs[type.slug] ?? type.displayName ?? type.slug;
        return (
          <button
            key={type.slug}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.chip} ${active ? styles.chipActive : ""}`}
            onClick={() => toggleSlug(type.slug)}
            data-testid={`entry-type-filter-${type.slug}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
