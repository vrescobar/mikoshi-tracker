import type { DietPreferences } from "@mikoshi-tracker/contracts/diet";
import { useState } from "react";

import { setDietPreferences } from "../../lib/diet-client";
import type { SupportedLocale } from "../../lib/i18n/messages";
import { useLocale } from "../locale";
import { Field, InlineStatus, Select, Surface, Toggle } from "../ui";
import styles from "./settings-pages.module.css";

type Copy = {
  languageTitle: string;
  languageDescription: string;
  unitsTitle: string;
  unitsDescription: string;
  unitsMetric: string;
  unitsImperial: string;
  notificationsTitle: string;
  weeklyReportLabel: string;
  weeklyReportDescription: string;
  saveError: string;
  offlineNote: string;
};

const COPY: Record<SupportedLocale, Copy> = {
  en: {
    languageTitle: "Language",
    languageDescription: "Choose the language for the interface.",
    unitsTitle: "Units",
    unitsDescription: "Used across diet macros and body weight.",
    unitsMetric: "Metric (kg, g)",
    unitsImperial: "Imperial (lb, oz)",
    notificationsTitle: "Notifications",
    weeklyReportLabel: "Weekly WhatsApp report",
    weeklyReportDescription: "Get a nutrition + habits chart every Monday morning. You can opt out any time.",
    saveError: "Couldn't save that preference. Try again.",
    offlineNote: "Preferences sync once the diet API is available.",
  },
  "zh-CN": {
    languageTitle: "语言",
    languageDescription: "选择界面语言。",
    unitsTitle: "单位",
    unitsDescription: "用于饮食宏量和体重。",
    unitsMetric: "公制 (kg, g)",
    unitsImperial: "英制 (lb, oz)",
    notificationsTitle: "通知",
    weeklyReportLabel: "每周 WhatsApp 报告",
    weeklyReportDescription: "每周一早上收到营养与习惯图表。可随时取消。",
    saveError: "无法保存该偏好，请重试。",
    offlineNote: "饮食 API 可用后偏好将同步。",
  },
  es: {
    languageTitle: "Idioma",
    languageDescription: "Elige el idioma de la interfaz.",
    unitsTitle: "Unidades",
    unitsDescription: "Se usan en los macros de dieta y el peso corporal.",
    unitsMetric: "Métrico (kg, g)",
    unitsImperial: "Imperial (lb, oz)",
    notificationsTitle: "Notificaciones",
    weeklyReportLabel: "Informe semanal por WhatsApp",
    weeklyReportDescription:
      "Recibe un gráfico de nutrición y hábitos cada lunes por la mañana. Puedes desactivarlo cuando quieras.",
    saveError: "No se pudo guardar esa preferencia. Inténtalo de nuevo.",
    offlineNote: "Las preferencias se sincronizan cuando la API de dieta esté disponible.",
  },
};

const LANGUAGES: Array<{ id: SupportedLocale; label: string }> = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
  { id: "zh-CN", label: "中文" },
];

export function SettingsPreferences({ initialPreferences }: { initialPreferences: DietPreferences | null }) {
  const { locale, setLocale } = useLocale();
  const copy = COPY[locale];
  const [prefs, setPrefs] = useState<DietPreferences>(initialPreferences ?? {});
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function persist(next: DietPreferences) {
    const previous = prefs;
    setPrefs(next);
    setError(false);
    setSaving(true);
    try {
      const saved = await setDietPreferences(next);
      setPrefs(saved);
    } catch {
      setPrefs(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.prefStack} data-testid="settings-preferences">
      {error ? <InlineStatus tone="danger" title={copy.saveError} /> : null}

      <Surface variant="panel" padding="md" className={styles.prefCard}>
        <div className={styles.prefHead}>
          <h3 className={styles.prefTitle}>{copy.languageTitle}</h3>
          <p className={styles.prefDescription}>{copy.languageDescription}</p>
        </div>
        <div className={styles.segmented} role="group" aria-label={copy.languageTitle}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              className={styles.segment}
              data-selected={locale === lang.id ? "true" : "false"}
              aria-pressed={locale === lang.id}
              onClick={() => setLocale(lang.id)}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </Surface>

      <Surface variant="panel" padding="md" className={styles.prefCard}>
        <div className={styles.prefHead}>
          <h3 className={styles.prefTitle}>{copy.unitsTitle}</h3>
          <p className={styles.prefDescription}>{copy.unitsDescription}</p>
        </div>
        <Field label={copy.unitsTitle} htmlFor="settings-units">
          <Select
            id="settings-units"
            value={prefs.units ?? "metric"}
            disabled={saving}
            onChange={(event) => void persist({ ...prefs, units: event.target.value as "metric" | "imperial" })}
          >
            <option value="metric">{copy.unitsMetric}</option>
            <option value="imperial">{copy.unitsImperial}</option>
          </Select>
        </Field>
      </Surface>

      <Surface variant="panel" padding="md" className={styles.prefCard}>
        <div className={styles.prefHead}>
          <h3 className={styles.prefTitle}>{copy.notificationsTitle}</h3>
        </div>
        <Toggle
          checked={prefs.weeklyReportOptIn ?? false}
          disabled={saving}
          onChange={(checked) => void persist({ ...prefs, weeklyReportOptIn: checked })}
          label={copy.weeklyReportLabel}
          description={copy.weeklyReportDescription}
          testId="weekly-report-toggle"
        />
      </Surface>

      <p className={styles.offlineNote}>{copy.offlineNote}</p>
    </div>
  );
}
