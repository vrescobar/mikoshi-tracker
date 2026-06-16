import { SettingsPage, type SettingsData } from "../../components/settings/settings-page";
import { getAdminRegistrationSettings, getApiAccessToken } from "../../lib/auth-client";
import { getDietPreferences } from "../../lib/diet-client";
import { listEntryTypes } from "../../lib/entries-client";
import { getSkillHealth } from "../../lib/skills-client";
import { useSession } from "../auth/session";
import { PageBoundary } from "../lib/page-boundary";
import { usePageData } from "../lib/use-page-data";

/**
 * Tabbed Settings hub (Preferences / Skills / API access). Loads every tab's
 * data once so switching tabs is instant; each loader degrades to a safe
 * default (the diet preferences endpoint may not exist on older API builds).
 */
export default function SettingsRoute() {
  const { user } = useSession();

  const state = usePageData<SettingsData>(async () => {
    const [preferences, skills, tokenState, registrationState] = await Promise.all([
      getDietPreferences().catch(() => null),
      loadSkills(),
      getApiAccessToken(),
      user.isAdmin ? getAdminRegistrationSettings().catch(() => null) : Promise.resolve(null),
    ]);
    return { preferences, skills, tokenState, registrationState };
  }, [user.id, user.isAdmin]);

  return <PageBoundary state={state}>{(data) => <SettingsPage data={data} isAdmin={user.isAdmin} />}</PageBoundary>;
}

async function loadSkills() {
  const entryTypes = await listEntryTypes().catch(() => []);
  const skillSlugs = entryTypes
    .filter((type) => typeof type.skillSlug === "string" && type.skillSlug.length > 0)
    .map((type) => ({ entryTypeName: type.displayName, slug: type.skillSlug! }));

  return Promise.all(
    skillSlugs.map(async (skill) => ({
      entryTypeName: skill.entryTypeName,
      health: await getSkillHealth(skill.slug),
    })),
  );
}
