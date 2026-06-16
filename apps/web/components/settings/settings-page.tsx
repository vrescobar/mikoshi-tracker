import type { ApiAccessTokenResponse } from "@mikoshi-tracker/contracts/api";
import type { DietPreferences } from "@mikoshi-tracker/contracts/diet";
import { useSearchParams } from "react-router";

import type { SkillHealthSnapshot } from "../../lib/skills-client";
import type { SupportedLocale } from "../../lib/i18n/messages";
import { ApiAccessPanel } from "../api/api-access-panel";
import { useLocale } from "../locale";
import { PageFrame, PageHeader, Surface, TabPanel, Tabs, type TabItem } from "../ui";
import { SettingsPreferences } from "./settings-preferences";
import { SettingsSkillsPage } from "./settings-skills-page";
import styles from "./settings-pages.module.css";

export type SettingsData = {
  preferences: DietPreferences | null;
  skills: Array<{ entryTypeName: string; health: SkillHealthSnapshot }>;
  tokenState: ApiAccessTokenResponse;
  registrationState: { registrationEnabled: boolean } | null;
};

type TabId = "preferences" | "skills" | "api";

const COPY: Record<SupportedLocale, { eyebrow: string; title: string; description: string; tabs: Record<TabId, string> }> =
  {
    en: {
      eyebrow: "Settings",
      title: "Settings",
      description: "Tune your tracker, inspect skills, and manage agent access.",
      tabs: { preferences: "Preferences", skills: "Skills", api: "API access" },
    },
    "zh-CN": {
      eyebrow: "设置",
      title: "设置",
      description: "调整你的追踪器、查看技能并管理代理访问。",
      tabs: { preferences: "偏好", skills: "技能", api: "API 访问" },
    },
    es: {
      eyebrow: "Ajustes",
      title: "Ajustes",
      description: "Ajusta tu tracker, revisa las skills y gestiona el acceso de agentes.",
      tabs: { preferences: "Preferencias", skills: "Skills", api: "Acceso API" },
    },
  };

const TAB_IDS: TabId[] = ["preferences", "skills", "api"];

export function SettingsPage({ data, isAdmin }: { data: SettingsData; isAdmin: boolean }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get("tab");
  const active: TabId = TAB_IDS.includes(requested as TabId) ? (requested as TabId) : "preferences";

  function selectTab(id: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  }

  const items: TabItem[] = [
    { id: "preferences", label: copy.tabs.preferences, icon: "settings" },
    { id: "skills", label: copy.tabs.skills, icon: "sparkles" },
    { id: "api", label: copy.tabs.api, icon: "key" },
  ];

  return (
    <div className={styles.stack} data-testid="settings-index-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
          <Tabs items={items} active={active} onChange={selectTab} ariaLabel={copy.title} variant="underline" />
        </PageFrame>
      </Surface>

      {active === "preferences" ? (
        <TabPanel id="preferences">
          <SettingsPreferences initialPreferences={data.preferences} />
        </TabPanel>
      ) : null}

      {active === "skills" ? (
        <TabPanel id="skills">
          <SettingsSkillsPage entries={data.skills} embedded />
        </TabPanel>
      ) : null}

      {active === "api" ? (
        <TabPanel id="api">
          <ApiAccessPanel
            initialTokenState={data.tokenState}
            initialRegistrationState={isAdmin ? data.registrationState : null}
            embedded
          />
        </TabPanel>
      ) : null}
    </div>
  );
}
