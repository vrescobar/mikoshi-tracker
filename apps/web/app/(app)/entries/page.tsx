import { EntriesPage } from "../../../components/entries/entries-page";
import { buildCookieHeader, listEntriesFromCookieHeader } from "../../../lib/server-auth";

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
  const initialItems = await listEntriesFromCookieHeader(cookieHeader, {
    entryTypeSlug,
    isActive,
  });

  return <EntriesPage initialItems={initialItems} entryTypeSlug={entryTypeSlug} />;
}
