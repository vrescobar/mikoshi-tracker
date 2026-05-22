"use client";

import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import Link from "next/link";

import type { FoodPayload, MealSlot } from "../../lib/food-client";
import { isFoodPayload } from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Badge } from "../ui";
import styles from "./FoodEventCard.module.css";

type FoodEventCardProps = {
  event: EntryEventRecord;
};

function formatTime(iso: string, localeStr: string) {
  return new Date(iso).toLocaleTimeString(localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mealSlotTone(slot: MealSlot | null): "info" | "neutral" {
  if (slot === "breakfast" || slot === "lunch" || slot === "dinner") return "info";
  return "neutral";
}

export function FoodEventCard({ event }: FoodEventCardProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const payload = isFoodPayload(event.payload) ? event.payload : null;

  if (!payload) {
    return (
      <article className={styles.card} data-testid="food-event-card">
        <span className={styles.name}>{String((event.payload as Record<string, unknown>)?.["name"] ?? "—")}</span>
      </article>
    );
  }

  const mealSlotLabel = payload.mealSlot ? copy.detail.mealSlots[payload.mealSlot] : null;

  return (
    <article className={styles.card} data-testid="food-event-card" data-event-id={event.id}>
      <div className={styles.cardHeader}>
        <div className={styles.titleRow}>
          {mealSlotLabel ? (
            <Badge tone={mealSlotTone(payload.mealSlot)}>{mealSlotLabel}</Badge>
          ) : null}
          <span className={styles.time}>{formatTime(event.occurredAt, locale)}</span>
        </div>
        <h3 className={styles.name}>{payload.name}</h3>
      </div>

      <div className={styles.macros}>
        <div className={styles.kcal}>
          <span className={styles.kcalValue}>{Math.round(payload.kcal)}</span>
          <span className={styles.kcalUnit}>{copy.page.totals.kcal}</span>
        </div>
        <div className={styles.macroRow}>
          <span className={styles.macro}>
            <span className={styles.macroLabel}>{copy.page.totals.protein}</span>
            <span className={styles.macroValue}>{payload.protein_g.toFixed(1)}g</span>
          </span>
          <span className={styles.macro}>
            <span className={styles.macroLabel}>{copy.page.totals.carbs}</span>
            <span className={styles.macroValue}>{payload.carbs_g.toFixed(1)}g</span>
          </span>
          <span className={styles.macro}>
            <span className={styles.macroLabel}>{copy.page.totals.fat}</span>
            <span className={styles.macroValue}>{payload.fat_g.toFixed(1)}g</span>
          </span>
          {payload.fiber_g !== null ? (
            <span className={styles.macro}>
              <span className={styles.macroLabel}>{copy.page.totals.fiber}</span>
              <span className={styles.macroValue}>{payload.fiber_g.toFixed(1)}g</span>
            </span>
          ) : null}
        </div>
      </div>

      {payload.notes ? <p className={styles.notes}>{payload.notes}</p> : null}

      <div className={styles.actions}>
        <Link href={routes.foodDetail(event.id)} className={styles.detailLink}>
          {copy.page.card.viewDetail}
        </Link>
      </div>
    </article>
  );
}

export function DeletedFoodEventCard({ event }: FoodEventCardProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const payload = isFoodPayload(event.payload) ? event.payload : null;

  return (
    <article className={styles.card} data-testid="food-event-card" data-deleted="true" data-event-id={event.id}>
      <div className={styles.cardHeader}>
        <div className={styles.titleRow}>
          <Badge tone="neutral">{copy.page.card.deletedBadge}</Badge>
          <span className={styles.time}>{formatTime(event.occurredAt, locale)}</span>
        </div>
        <h3 className={styles.name}>{payload?.name ?? "—"}</h3>
      </div>
      <div className={styles.actions}>
        <Link href={routes.foodDetail(event.id)} className={styles.detailLink}>
          {copy.page.card.viewDetail}
        </Link>
      </div>
    </article>
  );
}
