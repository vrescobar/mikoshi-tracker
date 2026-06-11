import { SettingsSkillsPage } from "../../components/settings/settings-skills-page";
import { listEntryTypes } from "../../lib/entries-client";
import { getSkillHealth, type SkillHealthSnapshot } from "../../lib/skills-client";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

/** Port of app/(app)/settings/skills/page.tsx. */
export default function SettingsSkillsRoute() {
  const state = usePageData<Array<{ entryTypeName: string; health: SkillHealthSnapshot }>>(
    async () => {
      const entryTypes = await listEntryTypes();
      const skillSlugs = entryTypes
        .filter((type) => typeof type.skillSlug === "string" && type.skillSlug.length > 0)
        .map((type) => ({ entryTypeName: type.displayName, slug: type.skillSlug! }));

      return Promise.all(
        skillSlugs.map(async (skill) => ({
          entryTypeName: skill.entryTypeName,
          health: await getSkillHealth(skill.slug),
        })),
      );
    },
    [],
  );

  return <PageBoundary state={state}>{(entries) => <SettingsSkillsPage entries={entries} />}</PageBoundary>;
}
