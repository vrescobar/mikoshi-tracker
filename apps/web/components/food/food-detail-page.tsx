import type { AttachmentMetadata } from "@mikoshi-tracker/contracts/attachments";
import type { EntryEventDetail, EventMutationRecord } from "@mikoshi-tracker/contracts/events";
import { Link } from "react-router";
import { useState, useTransition } from "react";

import { attachmentFileUrl } from "../../lib/auth-client";
import type { FoodPayload } from "../../lib/food-client";
import {
  deleteFoodEvent,
  getFoodEventDetail,
  isFoodPayload,
  undoFoodEvent,
  updateFoodEvent,
} from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { routes } from "../../lib/navigation";
import { diffPayload } from "../../lib/payload-diff";
import { useLocale } from "../locale";
import { Badge, Button, Field, Input, Notice, Surface } from "../ui";
import styles from "./food-detail-page.module.css";

type FoodDetailPageProps = {
  initialEvent: EntryEventDetail;
};

function formatDateTime(iso: string, localeStr: string) {
  return new Date(iso).toLocaleString(localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type EditState = {
  name: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  sugar_g: string;
  portion_g: string;
  mealSlot: string;
  notes: string;
};

export function payloadToEditState(p: FoodPayload): EditState {
  return {
    name: p.name,
    kcal: String(p.kcal),
    protein_g: String(p.protein_g),
    carbs_g: String(p.carbs_g),
    fat_g: String(p.fat_g),
    // Skill-logged payloads omit optional macros entirely (undefined, not null),
    // so use loose `!= null` to treat both the same and avoid "undefined" leaking
    // into the edit field.
    fiber_g: p.fiber_g != null ? String(p.fiber_g) : "",
    sugar_g: p.sugar_g != null ? String(p.sugar_g) : "",
    portion_g: p.portion_g != null ? String(p.portion_g) : "",
    mealSlot: p.mealSlot ?? "",
    notes: p.notes ?? "",
  };
}

export function editStateToPayload(state: EditState, original: FoodPayload): FoodPayload {
  return {
    ...original,
    name: state.name.trim(),
    kcal: parseFloat(state.kcal) || 0,
    protein_g: parseFloat(state.protein_g) || 0,
    carbs_g: parseFloat(state.carbs_g) || 0,
    fat_g: parseFloat(state.fat_g) || 0,
    fiber_g: state.fiber_g.trim() ? parseFloat(state.fiber_g) : null,
    sugar_g: state.sugar_g.trim() ? parseFloat(state.sugar_g) : null,
    portion_g: state.portion_g.trim() ? parseFloat(state.portion_g) : null,
    mealSlot: (state.mealSlot || null) as FoodPayload["mealSlot"],
    notes: state.notes.trim() || null,
  };
}

export function validateEditState(
  state: EditState,
  copy: ReturnType<typeof getFoodCopy>["detail"]["edit"],
): string | null {
  if (!state.name.trim()) return copy.validationName;
  const kcal = parseFloat(state.kcal);
  if (isNaN(kcal) || kcal < 0) return copy.validationKcal;
  const macros = [state.protein_g, state.carbs_g, state.fat_g].map(parseFloat);
  if (macros.some((v) => isNaN(v) || v < 0)) return copy.validationMacro;
  return null;
}

export function isDeleted(event: EntryEventDetail): boolean {
  if (!event.mutations || event.mutations.length === 0) return false;
  const sorted = [...event.mutations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted[0]?.type === "DELETE";
}

function formatDiffValue(value: unknown, removedLabel: string): string {
  if (value === undefined) return removedLabel;
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function MutationRow({
  mutation,
  copy,
}: {
  mutation: EventMutationRecord;
  copy: ReturnType<typeof getFoodCopy>["detail"]["mutations"];
}) {
  const isDelete = mutation.type === "DELETE";
  // For CREATE/DELETE/UNDO/UPDATE, the diff is from previousPayload to nextPayload
  // as stored on the mutation row. UNDO mutations carry the swap (next = the
  // payload state restored, previous = what was active just before).
  const entries = diffPayload(mutation.previousPayload, mutation.nextPayload);
  return (
    <div className={styles.mutationRow} data-type={mutation.type}>
      <div className={styles.mutationMeta}>
        <Badge tone={isDelete ? "neutral" : "info"}>{copy.types[mutation.type]}</Badge>
        <span className={styles.mutationSource}>{copy.sources[mutation.source]}</span>
      </div>
      {entries.length === 0 ? (
        <p className={styles.mutationDiffEmpty}>{copy.diff.noChanges}</p>
      ) : (
        <ul className={styles.mutationDiffList} data-testid="mutation-diff">
          {entries.map((entry) => (
            <li key={entry.field} className={styles.mutationDiffItem}>
              <span className={styles.mutationDiffField}>{entry.field}</span>
              <span className={styles.mutationDiffValue}>
                {formatDiffValue(entry.before, copy.diff.removed)}
                <span aria-hidden="true"> → </span>
                {formatDiffValue(entry.after, copy.diff.removed)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {mutation.note ? <p className={styles.mutationNote}>{mutation.note}</p> : null}
      <span className={styles.mutationTime}>{mutation.createdAt}</span>
    </div>
  );
}

function PhotoSection({
  attachments,
  copy,
}: {
  attachments: AttachmentMetadata[];
  copy: ReturnType<typeof getFoodCopy>["detail"]["photo"];
}) {
  const images = attachments.filter((a) => a.kind === "image");

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{copy.title}</h2>
      {images.length === 0 ? (
        <p className={styles.muted}>{copy.noPhoto}</p>
      ) : (
        <div className={styles.photoGrid}>
          {images.map((img) => (
            <a
              key={img.id}
              href={attachmentFileUrl(img.id)}
              target="_blank"
              rel="noreferrer"
              className={styles.photoLink}
            >
              <img
                src={attachmentFileUrl(img.id)}
                alt={img.originalName ?? ""}
                className={styles.photo}
                width={img.width ?? undefined}
                height={img.height ?? undefined}
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function FoodDetailPage({ initialEvent }: FoodDetailPageProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale).detail;

  const [event, setEvent] = useState(initialEvent);
  const [isEditing, setIsEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const payload = isFoodPayload(event.payload) ? event.payload : null;
  const deleted = isDeleted(event);
  const sortedMutations = [...(event.mutations ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  function startEdit() {
    if (!payload) return;
    setEditState(payloadToEditState(payload));
    setEditError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditState(null);
    setEditError(null);
  }

  function handleSave() {
    if (!editState || !payload) return;
    const validationError = validateEditState(editState, copy.edit);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    const nextPayload = editStateToPayload(editState, payload);
    setEditError(null);

    startTransition(async () => {
      try {
        const updated = await updateFoodEvent(event.id, nextPayload);
        setEvent(updated);
        setIsEditing(false);
        setEditState(null);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : copy.edit.errorTitle);
      }
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteFoodEvent(event.id);
        const refreshed = await getFoodEventDetail(event.id);
        setEvent(refreshed);
        setDeleteConfirm(false);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : copy.deleteSection.errorTitle);
      }
    });
  }

  function handleUndo() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        const undone = await undoFoodEvent(event.id);
        setEvent(undone);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : copy.deleteSection.errorTitle);
      }
    });
  }

  return (
    <div className={styles.stack} data-testid="food-detail-page">
      <Surface variant="hero">
        <div className={styles.heroInner}>
          <Link to={routes.food} className={styles.backLink}>
            {copy.backToFood}
          </Link>
          <p className={styles.eyebrow}>{copy.header.eyebrow}</p>
          {payload ? <h1 className={styles.heading}>{payload.name}</h1> : <h1 className={styles.heading}>—</h1>}
          {deleted ? <Badge tone="neutral">{getFoodCopy(locale).page.card.deletedBadge}</Badge> : null}
        </div>
      </Surface>

      <div className={styles.content}>
        {/* Photo */}
        <PhotoSection attachments={event.attachments ?? []} copy={copy.photo} />

        {/* Payload fields */}
        <div className={styles.section}>
          {deleted ? (
            <Notice tone="warning" title={copy.deleteSection.deletedTitle}>
              {copy.deleteSection.deletedDescription}
            </Notice>
          ) : null}

          {isEditing && editState ? (
            <div className={styles.editForm}>
              {editError ? (
                <Notice tone="danger" title={copy.edit.errorTitle}>
                  {editError}
                </Notice>
              ) : null}

              <Field label={copy.fields.name} htmlFor="food-edit-name">
                <Input
                  id="food-edit-name"
                  type="text"
                  value={editState.name}
                  onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                  disabled={isPending}
                />
              </Field>

              <div className={styles.macroGrid}>
                <Field label={copy.fields.kcal} htmlFor="food-edit-kcal">
                  <Input
                    id="food-edit-kcal"
                    type="number"
                    min="0"
                    step="1"
                    value={editState.kcal}
                    onChange={(e) => setEditState({ ...editState, kcal: e.target.value })}
                    disabled={isPending}
                  />
                </Field>
                <Field label={copy.fields.protein_g} htmlFor="food-edit-protein">
                  <Input
                    id="food-edit-protein"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editState.protein_g}
                    onChange={(e) => setEditState({ ...editState, protein_g: e.target.value })}
                    disabled={isPending}
                  />
                </Field>
                <Field label={copy.fields.carbs_g} htmlFor="food-edit-carbs">
                  <Input
                    id="food-edit-carbs"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editState.carbs_g}
                    onChange={(e) => setEditState({ ...editState, carbs_g: e.target.value })}
                    disabled={isPending}
                  />
                </Field>
                <Field label={copy.fields.fat_g} htmlFor="food-edit-fat">
                  <Input
                    id="food-edit-fat"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editState.fat_g}
                    onChange={(e) => setEditState({ ...editState, fat_g: e.target.value })}
                    disabled={isPending}
                  />
                </Field>
                <Field label={copy.fields.fiber_g} htmlFor="food-edit-fiber">
                  <Input
                    id="food-edit-fiber"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editState.fiber_g}
                    onChange={(e) => setEditState({ ...editState, fiber_g: e.target.value })}
                    disabled={isPending}
                  />
                </Field>
                <Field label={copy.fields.sugar_g} htmlFor="food-edit-sugar">
                  <Input
                    id="food-edit-sugar"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editState.sugar_g}
                    onChange={(e) => setEditState({ ...editState, sugar_g: e.target.value })}
                    disabled={isPending}
                  />
                </Field>
                <Field label={copy.fields.portion_g} htmlFor="food-edit-portion">
                  <Input
                    id="food-edit-portion"
                    type="number"
                    min="0"
                    step="1"
                    value={editState.portion_g}
                    onChange={(e) => setEditState({ ...editState, portion_g: e.target.value })}
                    disabled={isPending}
                  />
                </Field>

                <Field label={copy.fields.mealSlot} htmlFor="food-edit-slot">
                  <select
                    id="food-edit-slot"
                    className={styles.select}
                    value={editState.mealSlot}
                    onChange={(e) => setEditState({ ...editState, mealSlot: e.target.value })}
                    disabled={isPending}
                  >
                    <option value="">{copy.mealSlots.none}</option>
                    <option value="breakfast">{copy.mealSlots.breakfast}</option>
                    <option value="lunch">{copy.mealSlots.lunch}</option>
                    <option value="snack">{copy.mealSlots.snack}</option>
                    <option value="dinner">{copy.mealSlots.dinner}</option>
                    <option value="other">{copy.mealSlots.other}</option>
                  </select>
                </Field>
              </div>

              <Field label={copy.fields.notes} htmlFor="food-edit-notes">
                <textarea
                  id="food-edit-notes"
                  className={styles.textarea}
                  value={editState.notes}
                  onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                  disabled={isPending}
                  rows={3}
                />
              </Field>

              <div className={styles.editActions}>
                <Button type="button" variant="secondary" onClick={cancelEdit} disabled={isPending}>
                  {copy.edit.cancelLabel}
                </Button>
                <Button type="button" onClick={handleSave} disabled={isPending}>
                  {isPending ? copy.edit.saving : copy.edit.saveLabel}
                </Button>
              </div>
            </div>
          ) : payload ? (
            <div className={styles.payloadView}>
              <div className={styles.factsGrid}>
                <div className={styles.factBig}>
                  <span className={styles.factBigValue}>{Math.round(payload.kcal)}</span>
                  <span className={styles.factBigLabel}>{copy.fields.kcal}</span>
                </div>
                <Fact label={copy.fields.protein_g} value={`${(payload.protein_g ?? 0).toFixed(1)}g`} />
                <Fact label={copy.fields.carbs_g} value={`${(payload.carbs_g ?? 0).toFixed(1)}g`} />
                <Fact label={copy.fields.fat_g} value={`${(payload.fat_g ?? 0).toFixed(1)}g`} />
                {payload.fiber_g != null ? (
                  <Fact label={copy.fields.fiber_g} value={`${payload.fiber_g.toFixed(1)}g`} />
                ) : null}
                {payload.sugar_g != null ? (
                  <Fact label={copy.fields.sugar_g} value={`${payload.sugar_g.toFixed(1)}g`} />
                ) : null}
                {payload.portion_g != null ? (
                  <Fact label={copy.fields.portion_g} value={`${payload.portion_g.toFixed(0)}g`} />
                ) : null}
                {payload.mealSlot ? (
                  <Fact label={copy.fields.mealSlot} value={copy.mealSlots[payload.mealSlot]} />
                ) : null}
                <Fact label={copy.fields.source} value={copy.sources[payload.source]} />
                <Fact label={copy.fields.confidence} value={`${Math.round(payload.confidence * 100)}%`} />
              </div>

              {payload.notes ? <p className={styles.notes}>{payload.notes}</p> : null}

              {!deleted ? (
                <div className={styles.editActions}>
                  <Button type="button" variant="secondary" onClick={startEdit}>
                    {copy.edit.editLabel}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Delete section */}
        {!deleted ? (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{copy.deleteSection.title}</h2>
            <p className={styles.muted}>{copy.deleteSection.description}</p>

            {deleteError ? (
              <Notice tone="danger" title={copy.deleteSection.errorTitle}>
                {deleteError}
              </Notice>
            ) : null}

            {deleteConfirm ? (
              <div className={styles.deleteConfirm}>
                <Button type="button" variant="secondary" onClick={() => setDeleteConfirm(false)} disabled={isPending}>
                  {copy.deleteSection.cancelLabel}
                </Button>
                <Button type="button" variant="danger" onClick={handleDelete} disabled={isPending}>
                  {copy.deleteSection.confirmLabel}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="danger" onClick={() => setDeleteConfirm(true)}>
                {copy.deleteSection.deleteLabel}
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.section}>
            {deleteError ? (
              <Notice tone="danger" title={copy.deleteSection.errorTitle}>
                {deleteError}
              </Notice>
            ) : null}
            <Button type="button" variant="secondary" onClick={handleUndo} disabled={isPending}>
              {copy.deleteSection.undoLabel}
            </Button>
          </div>
        )}

        {/* Audit trail */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.mutations.title}</h2>
          {sortedMutations.length === 0 ? (
            <p className={styles.muted}>{copy.mutations.emptyState}</p>
          ) : (
            <div className={styles.mutationList}>
              {sortedMutations.map((m) => (
                <MutationRow key={m.id} mutation={m} copy={copy.mutations} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}
