"use client";

import { Link } from "react-router";

import { getSettingsCopy } from "../../lib/i18n/settings";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { PageFrame, PageHeader, Surface } from "../ui";
import styles from "./settings-pages.module.css";

export function SettingsIndexPage() {
  const { locale } = useLocale();
  const copy = getSettingsCopy(locale).index;

  return (
    <div className={styles.stack} data-testid="settings-index-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
        </PageFrame>
      </Surface>

      <div className={styles.cardGrid}>
        <Link to={routes.settingsSkills} className={styles.card} data-testid="settings-skills-card">
          <h2 className={styles.cardTitle}>{copy.skillsCard.title}</h2>
          <p className={styles.cardDescription}>{copy.skillsCard.description}</p>
          <span className={styles.cardCta}>{copy.skillsCard.cta} →</span>
        </Link>
        <Link to={routes.apiAccess} className={styles.card}>
          <h2 className={styles.cardTitle}>{copy.apiAccessCard.title}</h2>
          <p className={styles.cardDescription}>{copy.apiAccessCard.description}</p>
          <span className={styles.cardCta}>{copy.apiAccessCard.cta} →</span>
        </Link>
      </div>
    </div>
  );
}
