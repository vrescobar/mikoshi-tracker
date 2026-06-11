import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";
import { useTransition, useState } from "react";

import { getWeightCopy } from "../../lib/i18n/weight";
import { createWeightEvent, deleteWeightEvent, ensureWeightEntry, isWeightPayload } from "../../lib/weight-client";
import { useLocale } from "../locale";
import { Button, PageFrame, PageHeader, StatePanel, Surface } from "../ui";
import { WeightTrend } from "./weight-trend";
import styles from "./weight-page.module.css";

type WeightPageProps = {
  initialEvents: EntryEventRecord[];
  initialAggregations: AggregationResponse | null;
  initialEntryId: string | null;
};

export function WeightPage({ initialEvents, initialAggregations, initialEntryId }: WeightPageProps) {
  const { locale } = useLocale();
  const copy = getWeightCopy(locale);

  const [events, setEvents] = useState(initialEvents);
  const [entryId, setEntryId] = useState(initialEntryId);
  const [weightKgDraft, setWeightKgDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sorted = [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const kg = parseFloat(weightKgDraft.trim());
    if (!weightKgDraft.trim() || Number.isNaN(kg)) {
      setFormError(copy.form.errorRequired);
      return;
    }
    if (kg <= 0) {
      setFormError(copy.form.errorPositive);
      return;
    }
    setFormError(null);

    startTransition(async () => {
      try {
        let id = entryId;
        if (!id) {
          const entry = await ensureWeightEntry();
          id = entry.id;
          setEntryId(id);
        }
        const event = await createWeightEvent(id, {
          weight_kg: kg,
          notes: notesDraft.trim() || null,
        });
        setEvents((prev) => [...prev, event]);
        setWeightKgDraft("");
        setNotesDraft("");
      } catch (err) {
        setFormError(err instanceof Error ? err.message : copy.form.errorRequired);
      }
    });
  }

  function handleDelete(eventId: string) {
    startTransition(async () => {
      try {
        await deleteWeightEvent(eventId);
        setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      } catch {
        // silent — event stays in list if delete fails
      }
    });
  }

  return (
    <div className={styles.stack} data-testid="weight-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader
            eyebrow={copy.page.eyebrow}
            title={copy.page.title}
            description={copy.page.description}
          />
        </PageFrame>
      </Surface>

      <div className={styles.body}>
        <Surface variant="soft" padding="md">
          <PageFrame>
            <div className={styles.formPanel}>
              <p className={styles.formTitle}>{copy.page.logButton}</p>
              <form onSubmit={handleSubmit}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="weight-kg">
                    {copy.form.weightKg}
                  </label>
                  <input
                    id="weight-kg"
                    type="number"
                    step="0.1"
                    min="0"
                    className={styles.input}
                    value={weightKgDraft}
                    onChange={(e) => setWeightKgDraft(e.target.value)}
                    placeholder="78.5"
                    data-testid="weight-kg-input"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="weight-notes">
                    {copy.form.notes}
                  </label>
                  <input
                    id="weight-notes"
                    type="text"
                    className={styles.input}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder={copy.form.notesPlaceholder}
                    data-testid="weight-notes-input"
                  />
                </div>
                {formError ? (
                  <p className={styles.formError} role="alert">
                    {formError}
                  </p>
                ) : null}
                <div className={styles.formActions}>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? copy.page.logButtonSaving : copy.page.logButton}
                  </Button>
                </div>
              </form>
            </div>
          </PageFrame>
        </Surface>

        {initialAggregations && initialAggregations.buckets.length > 0 ? (
          <Surface variant="soft" padding="md">
            <PageFrame>
              <div className={styles.trendSection}>
                <p className={styles.sectionTitle}>{copy.trend.title}</p>
                <WeightTrend
                  buckets={initialAggregations.buckets}
                  label={copy.trend.label}
                  emptyLabel={copy.trend.empty}
                />
              </div>
            </PageFrame>
          </Surface>
        ) : null}

        {sorted.length === 0 ? (
          <StatePanel
            title={copy.page.emptyState.title}
            description={copy.page.emptyState.description}
          />
        ) : (
          <Surface variant="soft" padding="md">
            <PageFrame>
              <table className={styles.table} data-testid="weight-table">
                <thead>
                  <tr>
                    <th>{copy.table.date}</th>
                    <th>{copy.table.weight}</th>
                    <th>{copy.table.notes}</th>
                    <th>{copy.table.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((ev) => {
                    const p = isWeightPayload(ev.payload) ? ev.payload : null;
                    return (
                      <tr key={ev.id} data-testid="weight-row">
                        <td>{ev.dateKey}</td>
                        <td>
                          <span className={styles.weightValue}>
                            {p ? `${p.weight_kg.toFixed(1)} kg` : "—"}
                          </span>
                        </td>
                        <td>
                          {p?.notes ? (
                            <span className={styles.notes}>{p.notes}</span>
                          ) : (
                            <span className={styles.notes}>—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => handleDelete(ev.id)}
                            disabled={isPending}
                            aria-label={copy.table.delete}
                          >
                            {copy.table.delete}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </PageFrame>
          </Surface>
        )}
      </div>
    </div>
  );
}
