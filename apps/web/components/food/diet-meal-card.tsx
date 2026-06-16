import type { FoodDayMeal } from "@mikoshi-tracker/contracts/food";
import { useState } from "react";
import { Link } from "react-router";

import type { FoodPayload, MealSlot } from "../../lib/food-client";
import { deleteFoodEvent, updateFoodEvent } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Badge, Button, InlineStatus, SourceChip } from "../ui";
import styles from "./diet-meal-card.module.css";

type DietMealCardProps = {
  meal: FoodDayMeal;
  onChanged: () => void;
};

const SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner", "other"];

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale === "zh-CN" ? "zh-CN" : locale === "es" ? "es" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function DietMealCard({ meal, onChanged }: DietMealCardProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const t = copy.today;
  const p = meal.payload;

  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: String(p.name ?? ""),
    kcal: String(num(p.kcal)),
    protein_g: String(num(p.protein_g)),
    carbs_g: String(num(p.carbs_g)),
    fat_g: String(num(p.fat_g)),
    mealSlot: (p.mealSlot ?? "other") as MealSlot,
  });

  const slotLabel = p.mealSlot ? copy.detail.mealSlots[p.mealSlot] : null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next: FoodPayload = {
        ...(p as unknown as FoodPayload),
        name: form.name.trim() || String(p.name ?? ""),
        kcal: Number(form.kcal) || 0,
        protein_g: Number(form.protein_g) || 0,
        carbs_g: Number(form.carbs_g) || 0,
        fat_g: Number(form.fat_g) || 0,
        mealSlot: form.mealSlot,
      };
      await updateFoodEvent(meal.eventId, next);
      setMode("view");
      onChanged();
    } catch {
      setError(t.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteFoodEvent(meal.eventId);
      onChanged();
    } catch {
      setError(t.deleteError);
      setBusy(false);
      setMode("view");
    }
  }

  return (
    <article className={styles.card} data-testid="food-meal-card" data-event-id={meal.eventId}>
      {meal.attachments.length > 0 ? (
        <img
          className={styles.thumb}
          src={`${meal.attachments[0].url}?w=160`}
          alt={String(p.name ?? "")}
          loading="lazy"
          width={64}
          height={64}
        />
      ) : null}

      <div className={styles.body}>
        <div className={styles.headRow}>
          <div className={styles.titleWrap}>
            {slotLabel ? <Badge tone="info">{slotLabel}</Badge> : null}
            <span className={styles.time}>{formatTime(meal.occurredAt, locale)}</span>
            {meal.source ? <SourceChip source={meal.source} showLabel={false} /> : null}
          </div>
        </div>

        {mode === "edit" ? (
          <div className={styles.editForm}>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-label={copy.detail.fields.name}
            />
            <div className={styles.editGrid}>
              <label className={styles.field}>
                <span>{copy.page.totals.kcal}</span>
                <input
                  className={styles.input}
                  type="number"
                  value={form.kcal}
                  onChange={(e) => setForm((f) => ({ ...f, kcal: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>{copy.page.totals.protein}</span>
                <input
                  className={styles.input}
                  type="number"
                  value={form.protein_g}
                  onChange={(e) => setForm((f) => ({ ...f, protein_g: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>{copy.page.totals.carbs}</span>
                <input
                  className={styles.input}
                  type="number"
                  value={form.carbs_g}
                  onChange={(e) => setForm((f) => ({ ...f, carbs_g: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>{copy.page.totals.fat}</span>
                <input
                  className={styles.input}
                  type="number"
                  value={form.fat_g}
                  onChange={(e) => setForm((f) => ({ ...f, fat_g: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>{copy.detail.fields.mealSlot}</span>
                <select
                  className={styles.input}
                  value={form.mealSlot}
                  onChange={(e) => setForm((f) => ({ ...f, mealSlot: e.target.value as MealSlot }))}
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {copy.detail.mealSlots[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.actions}>
              <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
                {busy ? t.saving : t.save}
              </Button>
              <button type="button" className={styles.linkBtn} onClick={() => setMode("view")} disabled={busy}>
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className={styles.name}>{String(p.name ?? "—")}</h3>
            <div className={styles.macros}>
              <span className={styles.kcal}>
                {Math.round(num(p.kcal))} {copy.page.totals.kcal}
              </span>
              <span className={styles.macro}>P {num(p.protein_g).toFixed(0)}g</span>
              <span className={styles.macro}>C {num(p.carbs_g).toFixed(0)}g</span>
              <span className={styles.macro}>F {num(p.fat_g).toFixed(0)}g</span>
            </div>
            {p.notes ? <p className={styles.notes}>{p.notes}</p> : null}

            {mode === "confirmDelete" ? (
              <div className={styles.actions}>
                <span className={styles.confirmText}>{t.confirmDelete}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => void remove()} disabled={busy}>
                  {busy ? t.deleting : t.delete}
                </Button>
                <button type="button" className={styles.linkBtn} onClick={() => setMode("view")} disabled={busy}>
                  {t.cancel}
                </button>
              </div>
            ) : (
              <div className={styles.actions}>
                <button type="button" className={styles.linkBtn} onClick={() => setMode("edit")}>
                  {t.edit}
                </button>
                <button type="button" className={styles.linkBtn} onClick={() => setMode("confirmDelete")}>
                  {t.delete}
                </button>
                <Link to={routes.foodDetail(meal.eventId)} className={styles.linkBtn}>
                  {copy.page.card.viewDetail}
                </Link>
              </div>
            )}
          </>
        )}

        {error ? <InlineStatus tone="danger" title={error} /> : null}
      </div>
    </article>
  );
}
