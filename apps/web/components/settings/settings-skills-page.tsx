"use client";

import Link from "next/link";

import type { SkillHealthSnapshot } from "../../lib/skills-client";
import { getSettingsCopy } from "../../lib/i18n/settings";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { PageFrame, PageHeader, Surface } from "../ui";
import styles from "./settings-pages.module.css";

type Props = {
  entries: Array<{ entryTypeName: string; health: SkillHealthSnapshot }>;
};

function resolveTone(health: SkillHealthSnapshot): "enrolled" | "not-enrolled" | "unreachable" {
  if (health.unreachable) return "unreachable";
  return health.enrolled ? "enrolled" : "not-enrolled";
}

export function SettingsSkillsPage({ entries }: Props) {
  const { locale } = useLocale();
  const copy = getSettingsCopy(locale).skills;

  function statusLabel(snapshot: SkillHealthSnapshot): string {
    if (snapshot.unreachable) return copy.statusUnreachable;
    if (snapshot.enrolled) return copy.statusEnrolled;
    return copy.statusNotEnrolled;
  }

  return (
    <div className={styles.stack} data-testid="settings-skills-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
          <Link href={routes.settings} className={styles.backLink} data-testid="settings-skills-back">
            {copy.backLink}
          </Link>
        </PageFrame>
      </Surface>

      {entries.length === 0 ? (
        <p className={styles.empty} data-testid="settings-skills-empty">
          {copy.empty}
        </p>
      ) : (
        <div className={styles.skillsList}>
          {entries.map(({ entryTypeName, health }) => {
            const tone = resolveTone(health);
            return (
              <div
                key={health.skillSlug}
                className={styles.skillRow}
                data-testid={`settings-skill-${health.skillSlug}`}
                data-tone={tone}
              >
                <div className={styles.skillHeader}>
                  <div>
                    <h3 className={styles.skillName}>{entryTypeName}</h3>
                    <span className={styles.skillSlug}>{health.skillSlug}</span>
                  </div>
                  <span className={styles.skillStatus} data-tone={tone}>
                    {statusLabel(health)}
                  </span>
                </div>
                <div className={styles.skillMeta}>
                  <span className={styles.skillMetaLabel}>{copy.lastRunLabel}</span>
                  <span>{health.lastRunAt ?? copy.lastRunNever}</span>
                  {health.lastError ? (
                    <>
                      <span className={styles.skillMetaLabel}>{copy.lastErrorLabel}</span>
                      <span className={styles.skillMetaError}>{health.lastError}</span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
