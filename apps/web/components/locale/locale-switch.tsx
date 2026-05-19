"use client";

import type { SupportedLocale } from "../../lib/i18n/messages";
import { Button } from "../ui";
import { useLocale } from "./locale-provider";
import styles from "./locale-switch.module.css";

const localeNextMap: Record<SupportedLocale, SupportedLocale> = {
  en: "zh-CN",
  "zh-CN": "es",
  es: "en",
};

const localeActionLabels: Record<SupportedLocale, string> = {
  en: "Switch to English",
  "zh-CN": "切换到中文",
  es: "Cambiar a español",
};

export function LocaleSwitch() {
  const { locale, copy, setLocale } = useLocale();
  const nextLocale = localeNextMap[locale];
  const actionLabel = localeActionLabels[nextLocale];

  return (
    <div className={styles.switch} data-testid="locale-switch">
      <Button
        type="button"
        variant="ghost"
        className={styles.button}
        data-testid="locale-switch-button"
        aria-label={`${copy.meta.localeSwitchLabel}: ${actionLabel}`}
        title={actionLabel}
        onClick={() => setLocale(nextLocale)}
      >
        <span className={styles.icon} aria-hidden="true">
          <span className={styles.latin}>ES</span>
          <span className={styles.divider}>/</span>
          <span className={styles.cjk}>中</span>
          <span className={styles.divider}>/</span>
          <span className={styles.latin}>EN</span>
        </span>
      </Button>
    </div>
  );
}
