import { useSearchParams } from "react-router";

import { EntriesPage } from "../../components/entries/entries-page";
import {
  listEntries,
  listEntryTypes,
  type EntryTypeRecord,
} from "../../lib/entries-client";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";

/** Port of app/(app)/entries/page.tsx (searchParams: entryTypeSlug, status). */
export default function EntriesPageRoute() {
  const [searchParams] = useSearchParams();
  const entryTypeSlug = searchParams.get("entryTypeSlug") ?? undefined;
  const isActive = searchParams.get("status") !== "archived";

  const state = usePageData<{
    items: EntryRecord[];
    entryTypes: EntryTypeRecord[];
  }>(async () => {
    const [items, entryTypes] = await Promise.all([
      listEntries({ entryTypeSlug, isActive }),
      listEntryTypes().catch(() => []),
    ]);
    return { items, entryTypes };
  }, [entryTypeSlug ?? "", isActive]);

  return (
    <PageBoundary state={state}>
      {(data) => (
        <EntriesPage
          initialItems={data.items}
          entryTypeSlug={entryTypeSlug}
          entryTypes={data.entryTypes}
        />
      )}
    </PageBoundary>
  );
}
