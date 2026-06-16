import type { DietGoalRecord } from "@mikoshi-tracker/contracts/diet";
import { useEffect, useState } from "react";

import { getDietGoal, setDietGoal } from "../../lib/diet-client";
import type { SupportedLocale } from "../../lib/i18n/messages";
import { useLocale } from "../locale";
import { Button, Field, InlineStatus, Input, SkeletonBlock, Surface } from "../ui";
import { MacroPie } from "./MacroPie";
import styles from "./diet-goal-panel.module.css";

type Copy = {
  title: string;
  description: string;
  kcalLabel: string;
  splitTitle: string;
  splitHint: string;
  protein: string;
  carbs: string;
  fat: string;
  previewLabel: string;
  emptyPreview: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
  sumWarning: (total: number) => string;
  gramsLabel: string;
};

const COPY: Record<SupportedLocale, Copy> = {
  en: {
    title: "Daily goal",
    description: "Set the calories and macro split your tracker measures each day against.",
    kcalLabel: "Daily calories (kcal)",
    splitTitle: "Macro split",
    splitHint: "Percent of calories from each macronutrient. They should add up to 100%.",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    previewLabel: "Target split",
    emptyPreview: "Set a split to preview it.",
    save: "Save goal",
    saving: "Saving…",
    saved: "Goal saved.",
    error: "Couldn't save the goal. Try again.",
    sumWarning: (total) => `Macros add up to ${total}%. Aim for 100%.`,
    gramsLabel: "grams/day",
  },
  "zh-CN": {
    title: "每日目标",
    description: "设置追踪器每天对照的卡路里和宏量分配。",
    kcalLabel: "每日卡路里 (kcal)",
    splitTitle: "宏量分配",
    splitHint: "每种宏量营养素占卡路里的百分比，应合计 100%。",
    protein: "蛋白质",
    carbs: "碳水",
    fat: "脂肪",
    previewLabel: "目标分配",
    emptyPreview: "设置分配以预览。",
    save: "保存目标",
    saving: "保存中…",
    saved: "目标已保存。",
    error: "无法保存目标，请重试。",
    sumWarning: (total) => `宏量合计为 ${total}%，目标为 100%。`,
    gramsLabel: "克/天",
  },
  es: {
    title: "Objetivo diario",
    description: "Define las calorías y el reparto de macros con el que tu tracker te mide cada día.",
    kcalLabel: "Calorías diarias (kcal)",
    splitTitle: "Reparto de macros",
    splitHint: "Porcentaje de calorías de cada macronutriente. Deberían sumar 100%.",
    protein: "Proteína",
    carbs: "Carbohidratos",
    fat: "Grasa",
    previewLabel: "Reparto objetivo",
    emptyPreview: "Define un reparto para previsualizarlo.",
    save: "Guardar objetivo",
    saving: "Guardando…",
    saved: "Objetivo guardado.",
    error: "No se pudo guardar el objetivo. Inténtalo de nuevo.",
    sumWarning: (total) => `Los macros suman ${total}%. El objetivo es 100%.`,
    gramsLabel: "gramos/día",
  },
};

/** Atwater grams from a kcal target and a percentage of calories. */
function gramsFromPct(kcal: number, pct: number, kcalPerGram: number): number {
  return Math.round((kcal * (pct / 100)) / kcalPerGram);
}

export function DietGoalPanel() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [loading, setLoading] = useState(true);
  const [kcal, setKcal] = useState(2000);
  const [protein, setProtein] = useState(30);
  const [carbs, setCarbs] = useState(40);
  const [fat, setFat] = useState(30);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    void getDietGoal()
      .then((goal) => {
        if (cancelled || !goal) return;
        if (goal.kcalTarget) setKcal(Math.round(goal.kcalTarget));
        if (goal.proteinPct != null) setProtein(Math.round(goal.proteinPct));
        if (goal.carbsPct != null) setCarbs(Math.round(goal.carbsPct));
        if (goal.fatPct != null) setFat(Math.round(goal.fatPct));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const proteinG = gramsFromPct(kcal, protein, 4);
  const carbsG = gramsFromPct(kcal, carbs, 4);
  const fatG = gramsFromPct(kcal, fat, 9);
  const sum = protein + carbs + fat;

  async function save() {
    setStatus("saving");
    try {
      const saved: DietGoalRecord = (await setDietGoal({
        kcalTarget: kcal,
        macroMode: "percent",
        proteinPct: protein,
        carbsPct: carbs,
        fatPct: fat,
        proteinTargetG: proteinG,
        carbsTargetG: carbsG,
        fatTargetG: fatG,
        source: "manual",
      })) ?? {
        kcalTarget: kcal,
        eventId: null,
        updatedAt: null,
      };
      if (saved.kcalTarget) setKcal(Math.round(saved.kcalTarget));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (loading) {
    return (
      <div className={styles.loading} data-testid="diet-goal-panel">
        <SkeletonBlock height="3rem" />
        <SkeletonBlock height="11rem" />
      </div>
    );
  }

  return (
    <div className={styles.grid} data-testid="diet-goal-panel">
      <Surface variant="panel" padding="md" className={styles.form}>
        <header className={styles.head}>
          <h2 className={styles.title}>{copy.title}</h2>
          <p className={styles.description}>{copy.description}</p>
        </header>

        <Field label={copy.kcalLabel} htmlFor="goal-kcal">
          <Input
            id="goal-kcal"
            type="number"
            min={500}
            max={8000}
            step={10}
            value={kcal}
            onChange={(event) => setKcal(Number(event.target.value))}
          />
        </Field>

        <div className={styles.splitHead}>
          <h3 className={styles.splitTitle}>{copy.splitTitle}</h3>
          <p className={styles.splitHint}>{copy.splitHint}</p>
        </div>

        <div className={styles.macroRow}>
          <MacroSlider
            label={copy.protein}
            color="var(--cat-rest)"
            value={protein}
            grams={proteinG}
            gramsLabel={copy.gramsLabel}
            onChange={setProtein}
          />
          <MacroSlider
            label={copy.carbs}
            color="var(--cat-move)"
            value={carbs}
            grams={carbsG}
            gramsLabel={copy.gramsLabel}
            onChange={setCarbs}
          />
          <MacroSlider
            label={copy.fat}
            color="var(--cat-water)"
            value={fat}
            grams={fatG}
            gramsLabel={copy.gramsLabel}
            onChange={setFat}
          />
        </div>

        {sum !== 100 ? <InlineStatus tone="warning" title={copy.sumWarning(sum)} /> : null}
        {status === "saved" ? <InlineStatus tone="success" title={copy.saved} /> : null}
        {status === "error" ? <InlineStatus tone="danger" title={copy.error} /> : null}

        <div className={styles.actions}>
          <Button type="button" onClick={() => void save()} disabled={status === "saving"}>
            {status === "saving" ? copy.saving : copy.save}
          </Button>
        </div>
      </Surface>

      <Surface variant="panel" padding="md" className={styles.preview}>
        <span className={styles.previewLabel}>{copy.previewLabel}</span>
        <MacroPie
          proteinG={proteinG}
          carbsG={carbsG}
          fatG={fatG}
          label={`${kcal} kcal`}
          emptyLabel={copy.emptyPreview}
          legend={{ protein: copy.protein, carbs: copy.carbs, fat: copy.fat }}
        />
      </Surface>
    </div>
  );
}

function MacroSlider({
  label,
  color,
  value,
  grams,
  gramsLabel,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  grams: number;
  gramsLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.macroSlider}>
      <span className={styles.macroTop}>
        <span className={styles.macroDot} style={{ background: color }} aria-hidden="true" />
        <span className={styles.macroLabel}>{label}</span>
        <span className={styles.macroPct}>{value}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        className={styles.range}
        style={{ accentColor: color }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className={styles.macroGrams}>
        {grams} {gramsLabel}
      </span>
    </label>
  );
}
