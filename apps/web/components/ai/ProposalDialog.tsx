"use client";

import type { EntryEventDetail } from "@mikoshi-tracker/contracts/events";
import { useRef, useState, useTransition } from "react";

import type { FoodPayload, MealSlot } from "../../lib/food-client";
import {
  attachImageToFoodEvent,
  createFoodEvent,
  ensureFoodEntry,
} from "../../lib/food-client";
import { getFoodCopy } from "../../lib/i18n/food";
import { useLocale } from "../locale";
import { Button, Field, Input, Notice, OverlayPanel, Select } from "../ui";
import styles from "./ProposalDialog.module.css";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (event: EntryEventDetail) => void;
};

type FormState = {
  name: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  mealSlot: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  fiber_g: "",
  mealSlot: "",
  notes: "",
};

function parseNonNegative(value: string): number | null {
  if (!value.trim()) return null;
  const n = parseFloat(value);
  return isNaN(n) || n < 0 ? null : n;
}

export function ProposalDialog({ open, onOpenChange, onCreated }: Props) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const dialogCopy = copy.dialog;
  const fieldCopy = copy.detail.fields;
  const editCopy = copy.detail.edit;
  const slotCopy = copy.detail.mealSlots;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setForm(emptyForm);
    setError(null);
    setWarning(null);
    setPhotoFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("read-error"));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("read-error"));
          return;
        }
        // result is a data URL like `data:image/png;base64,XXX`
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return editCopy.validationName;
    const kcal = parseFloat(form.kcal);
    if (isNaN(kcal) || kcal < 0) return editCopy.validationKcal;
    const macros = [form.protein_g, form.carbs_g, form.fat_g].map((v) => parseFloat(v));
    if (macros.some((v) => isNaN(v) || v < 0)) return editCopy.validationMacro;
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      setError(null);
      setWarning(null);
      try {
        const entry = await ensureFoodEntry();
        const payload: FoodPayload = {
          name: form.name.trim(),
          kcal: parseFloat(form.kcal),
          protein_g: parseFloat(form.protein_g),
          carbs_g: parseFloat(form.carbs_g),
          fat_g: parseFloat(form.fat_g),
          fiber_g: parseNonNegative(form.fiber_g),
          sugar_g: null,
          portion_g: null,
          mealSlot: (form.mealSlot || null) as MealSlot | null,
          source: "manual",
          confidence: 1.0,
          similarToEventId: null,
          sources: null,
          notes: form.notes.trim() || null,
        };
        const event = await createFoodEvent(entry.id, payload);

        // Attach the photo after the event lands. A failed upload must not
        // discard the saved meal, so we surface a warning and still close.
        if (photoFile) {
          try {
            const base64 = await readFileAsBase64(photoFile);
            await attachImageToFoodEvent(event.id, base64, photoFile.name);
          } catch {
            setWarning(dialogCopy.photoUploadFailed);
          }
        }

        reset();
        onOpenChange(false);
        onCreated(event);
      } catch (err) {
        setError(err instanceof Error ? err.message : dialogCopy.errorTitle);
      }
    });
  }

  return (
    <OverlayPanel
      open={open}
      onOpenChange={handleOpenChange}
      title={dialogCopy.title}
      description={dialogCopy.description}
      closeLabel={dialogCopy.cancelLabel}
      testId="proposal-dialog"
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        {error ? (
          <Notice tone="danger" title={dialogCopy.errorTitle}>
            {error}
          </Notice>
        ) : null}

        {warning ? (
          <Notice tone="warning" title={dialogCopy.errorTitle}>
            {warning}
          </Notice>
        ) : null}

        <Field label={fieldCopy.name} required>
          <Input
            ref={nameRef}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
            disabled={isPending}
          />
        </Field>

        <div className={styles.macroGrid}>
          <Field label={fieldCopy.kcal} required>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.kcal}
              onChange={(e) => set("kcal", e.target.value)}
              placeholder="0"
              disabled={isPending}
            />
          </Field>
          <Field label={fieldCopy.protein_g} required>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.protein_g}
              onChange={(e) => set("protein_g", e.target.value)}
              placeholder="0"
              disabled={isPending}
            />
          </Field>
          <Field label={fieldCopy.carbs_g} required>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.carbs_g}
              onChange={(e) => set("carbs_g", e.target.value)}
              placeholder="0"
              disabled={isPending}
            />
          </Field>
          <Field label={fieldCopy.fat_g} required>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.fat_g}
              onChange={(e) => set("fat_g", e.target.value)}
              placeholder="0"
              disabled={isPending}
            />
          </Field>
        </div>

        <div className={styles.optionalRow}>
          <Field label={fieldCopy.mealSlot}>
            <Select value={form.mealSlot} onChange={(e) => set("mealSlot", e.target.value)} disabled={isPending}>
              <option value="">{slotCopy.none}</option>
              <option value="breakfast">{slotCopy.breakfast}</option>
              <option value="lunch">{slotCopy.lunch}</option>
              <option value="snack">{slotCopy.snack}</option>
              <option value="dinner">{slotCopy.dinner}</option>
              <option value="other">{slotCopy.other}</option>
            </Select>
          </Field>
          <Field label={fieldCopy.fiber_g}>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.fiber_g}
              onChange={(e) => set("fiber_g", e.target.value)}
              placeholder="—"
              disabled={isPending}
            />
          </Field>
        </div>

        <Field label={fieldCopy.notes}>
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={isPending} />
        </Field>

        <Field label={dialogCopy.photoLabel} description={dialogCopy.photoHint}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setPhotoFile(file);
            }}
            data-testid="proposal-dialog-photo"
          />
        </Field>

        <div className={styles.actions}>
          <Button type="submit" disabled={isPending}>
            {isPending ? dialogCopy.submittingLabel : dialogCopy.submitLabel}
          </Button>
        </div>
      </form>
    </OverlayPanel>
  );
}
