import {
  buildCookieHeader,
  getSkillHealthFromCookieHeader,
  listEntryTypesFromCookieHeader,
  type SkillHealthSnapshot,
} from "../../../../lib/server-auth";
import { SettingsSkillsPage } from "../../../../components/settings/settings-skills-page";

export default async function SettingsSkillsRoute() {
  const cookieHeader = await buildCookieHeader();
  const entryTypes = await listEntryTypesFromCookieHeader(cookieHeader).catch(() => []);
  const skillSlugs = entryTypes
    .filter((t) => typeof t.skillSlug === "string" && t.skillSlug.length > 0)
    .map((t) => ({ entryTypeName: t.name, slug: t.skillSlug as string }));

  const healthEntries: Array<{ entryTypeName: string; health: SkillHealthSnapshot }> =
    await Promise.all(
      skillSlugs.map(async (s) => ({
        entryTypeName: s.entryTypeName,
        health: await getSkillHealthFromCookieHeader(cookieHeader, s.slug),
      })),
    );

  return <SettingsSkillsPage entries={healthEntries} />;
}
