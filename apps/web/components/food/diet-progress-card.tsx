import type { TodayNutrition } from "@mikoshi-tracker/contracts/today";
import { Link } from "react-router";

import { getFoodCopy } from "../../lib/i18n/food";
import { ProgressRing } from "../dashboard/ProgressRing";
import { useLocale } from "../locale";
import { StatePanel, Surface } from "../ui";
import styles from "./diet-progress-card.module.css";

type DietProgressCardProps = {
  nutrition: TodayNutrition | null;
  mealCount: number;
};

type MacroKey = "protein_g" | "carbs_g" | "fat_g";

const MACROS: Array<{ key: MacroKey; target: keyof TodayNutrition; color: string; soft: string }> = [
  { key: "protein_g", target: "proteinTargetG", color: "var(--cat-rest)", soft: "var(--cat-rest-soft)" },
  { key: "carbs_g", target: "carbsTargetG", color: "var(--cat-move)", soft: "var(--cat-move-soft)" },
  { key: "fat_g", target: "fatTargetG", color: "var(--cat-water)", soft: "var(--cat-water-soft)" },
];

const MACRO_LABEL_KEYS: Record<MacroKey, "protein" | "carbs" | "fat"> = {
  protein_g: "protein",
  carbs_g: "carbs",
  fat_g: "fat",
};

/**
 * "Today vs your goal": the kcal ring plus per-macro progress bars and a
 * per-slot breakdown. Calm by design — green within budget, coral over. When no
 * goal is set, nudges the user to the Goal tab instead of showing an empty ring.
 */
export function DietProgressCard({ nutrition, mealCount }: DietProgressCardProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const t = copy.today;

  if (!nutrition) return null;

  const target = nutrition.kcalTarget;
  const kcal = Math.round(nutrition.kcal);

  if (target == null) {
    return (
      <Surface variant="panel" padding="md" className={styles.card} data-testid="diet-progress-card">
        <div className={styles.headRow}>
          <span className={styles.title}>{t.goalsTitle}</span>
          <span className={styles.consumed}>
            {kcal} {copy.page.totals.kcal}
          </span>
        </div>
        <StatePanel
          compact
          title={t.noTargetTitle}
          description={t.noTargetBody}
          actions={
            <Link to="/food?tab=goal" className={styles.goalLink}>
              {t.setGoal}
            </Link>
          }
        />
      </Surface>
    );
  }

  const ratio = target > 0 ? kcal / target : 0;
  const onTrack = kcal <= target;
  const ringColor = onTrack ? "var(--color-accent)" : "var(--color-accent-diet)";
  const remaining = Math.round(target - kcal);

  return (
    <Surface variant="panel" padding="md" className={styles.card} data-testid="diet-progress-card">
      <div className={styles.headRow}>
        <span className={styles.title}>{t.goalsTitle}</span>
        <span className={styles.mealCount}>
          {mealCount} {locale === "es" ? "comidas" : locale === "zh-CN" ? "餐" : "meals"}
        </span>
      </div>

      <div className={styles.ringRow}>
        <ProgressRing
          value={Math.min(Math.max(ratio, 0), 1)}
          label={`${Math.round(ratio * 100)}%`}
          sublabel={`${kcal} ${t.of} ${target}`}
          color={ringColor}
        />
        <p className={styles.remaining}>
          <span className={styles.remainingValue}>{Math.abs(remaining)}</span>
          <span>{remaining >= 0 ? t.remaining : t.over}</span>
        </p>
      </div>

      <div className={styles.macros}>
        {MACROS.map((m) => {
          const consumed = Math.round(nutrition[m.key] as number);
          const macroTarget = nutrition[m.target] as number | null;
          const pct = macroTarget && macroTarget > 0 ? Math.min(consumed / macroTarget, 1) : 0;
          return (
            <div key={m.key} className={styles.macro}>
              <div className={styles.macroHead}>
                <span className={styles.macroLabel}>{copy.page.totals[MACRO_LABEL_KEYS[m.key]]}</span>
                <span className={styles.macroValue}>
                  {consumed}
                  {macroTarget != null ? (
                    <span className={styles.macroTarget}> / {Math.round(macroTarget)}g</span>
                  ) : (
                    "g"
                  )}
                </span>
              </div>
              <div className={styles.bar} style={{ background: m.soft }}>
                <div
                  className={styles.barFill}
                  style={{ width: `${Math.round(pct * 100)}%`, background: m.color }}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>

      {nutrition.bySlot.length > 0 ? (
        <ul className={styles.slots}>
          {nutrition.bySlot.map((s) => {
            const pct = s.kcalTarget && s.kcalTarget > 0 ? Math.min(s.kcal / s.kcalTarget, 1) : null;
            return (
              <li key={s.slot} className={styles.slotRow}>
                <span className={styles.slotName}>{copy.detail.mealSlots[s.slot]}</span>
                <div className={styles.slotBar}>
                  {pct !== null ? (
                    <div className={styles.slotFill} style={{ width: `${Math.round(pct * 100)}%` }} />
                  ) : null}
                </div>
                <span className={styles.slotKcal}>
                  {Math.round(s.kcal)}
                  {s.kcalTarget != null ? `/${Math.round(s.kcalTarget)}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Surface>
  );
}
