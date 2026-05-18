import { CirclesPage } from "../../../components/circles/circles-page";
import { buildCookieHeader, getSessionFromCookieHeader, listCirclesFromCookieHeader } from "../../../lib/server-auth";

export default async function CirclesListPage() {
  const cookieHeader = await buildCookieHeader();
  const [initialItems, session] = await Promise.all([
    listCirclesFromCookieHeader(cookieHeader),
    getSessionFromCookieHeader(cookieHeader),
  ]);

  return <CirclesPage initialItems={initialItems} currentUserId={session?.user.id ?? ""} />;
}
