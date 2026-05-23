import { EntriesPage } from "../../../components/entries/entries-page";
import {
  buildCookieHeader,
  listEntriesFromCookieHeader,
  listEntryTypesFromCookieHeader,
} from "../../../lib/server-auth";

type EntriesManagementPageProps = {
  searchParams?: Promise<{
    entryTypeSlug?: string;
    status?: string;
  }>;
};

export default async function EntriesManagementPage({ searchParams }: EntriesManagementPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const entryTypeSlug = params?.entryTypeSlug;
  const isActive = params?.status !== "archived";

  const cookieHeader = await buildCookieHeader();
  const [initialItems, entryTypes] = await Promise.all([
    listEntriesFromCookieHeader(cookieHeader, {
      entryTypeSlug,
      isActive,
    }),
    listEntryTypesFromCookieHeader(cookieHeader).catch(() => []),
  ]);

  return (
    <EntriesPage
      initialItems={initialItems}
      entryTypeSlug={entryTypeSlug}
      entryTypes={entryTypes}
    />
  );
}
