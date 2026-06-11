"use client";

import type { EntryEventDetail } from "@mikoshi-tracker/contracts/events";
import { useRef, useState, useTransition } from "react";

import type { FoodPayload, MealSlot } from "../../lib/food-client";
import {
  attachImageToFoodEvent,
  createFoodEvent,
  ensureFoodEntry,
  runFoodSkill,
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

type Mode = "manual" | "photo" | "text";

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

const SKILL_RUN_ENABLED = import.meta.env.VITE_FEATURE_WEB_SKILL_RUN === "1";

function parseNonNegative(value: string): number | null {
  if (!value.trim()) return null;
  const n = parseFloat(value);
  return isNaN(n) || n < 0 ? null : n;
}

function num(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "" && !isNaN(parseFloat(value))) return value;
  return "";
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asMealSlot(value: unknown): string {
  if (
    typeof value === "string" &&
    ["breakfast", "lunch", "snack", "dinner", "other"].includes(value)
  ) {
    return value;
  }
  return "";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read-error"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("read-error"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function ProposalDialog({ open, onOpenChange, onCreated }: Props) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale);
  const dialogCopy = copy.dialog;
  const fieldCopy = copy.detail.fields;
  const editCopy = copy.detail.edit;
  const slotCopy = copy.detail.mealSlots;

  const [mode, setMode] = useState<Mode>("manual");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [skillText, setSkillText] = useState("");
  const [skillPhotoFile, setSkillPhotoFile] = useState<File | null>(null);
  const [proposalSource, setProposalSource] = useState<
    "label" | "similar_to_event" | "web_lookup" | "vision_only" | "manual"
  >("manual");
  const [hasProposal, setHasProposal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [skillIsRunning, setSkillIsRunning] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skillFileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setForm(emptyForm);
    setError(null);
    setWarning(null);
    setPhotoFile(null);
    setSkillText("");
    setSkillPhotoFile(null);
    setHasProposal(false);
    setProposalSource("manual");
    setMode("manual");
    if (fileRef.current) fileRef.current.value = "";
    if (skillFileRef.current) skillFileRef.current.value = "";
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

  function applyProposalToForm(proposed: Record<string, unknown>) {
    setForm({
      name: str(proposed.name),
      kcal: num(proposed.kcal),
      protein_g: num(proposed.protein_g),
      carbs_g: num(proposed.carbs_g),
      fat_g: num(proposed.fat_g),
      fiber_g: num(proposed.fiber_g),
      mealSlot: asMealSlot(proposed.mealSlot),
      notes: str(proposed.notes),
    });
    const src = str(proposed.source);
    if (
      src === "label" ||
      src === "similar_to_event" ||
      src === "web_lookup" ||
      src === "vision_only"
    ) {
      setProposalSource(src);
    } else {
      setProposalSource("manual");
    }
    setHasProposal(true);
    setMode("manual");
  }

  async function handleSkillRun(input: {
    tool: "food_log_from_input";
    text?: string;
    imageBase64?: string;
  }) {
    setError(null);
    setWarning(null);
    setSkillIsRunning(true);
    try {
      const raw = await runFoodSkill(input);
      const result = (raw ?? {}) as Record<string, unknown>;
      const action = str(result.action);
      if (action === "auto_posted") {
        // The skill posted directly. Refresh the food list (the caller
        // chooses how — they pass a refetch via onCreated semantics).
        const event = (result.event ?? null) as EntryEventDetail | null;
        if (event) {
          reset();
          onOpenChange(false);
          onCreated(event);
          return;
        }
        // No event payload returned; close anyway and let the caller refetch.
        reset();
        onOpenChange(false);
        return;
      }
      if (action === "pending_confirmation") {
        const proposed = (result.proposed ?? result.payload ?? {}) as Record<string, unknown>;
        applyProposalToForm(proposed);
        return;
      }
      if (action === "needs_enrolment") {
        setError(dialogCopy.skill.needsEnrolment);
        return;
      }
      // Unknown / error
      const message = str(result.message);
      setError(message || dialogCopy.skill.genericError);
    } catch (err) {
      setError(err instanceof Error ? err.message : dialogCopy.skill.genericError);
    } finally {
      setSkillIsRunning(false);
    }
  }

  function handlePhotoSkillSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!skillPhotoFile) return;
    void (async () => {
      try {
        const imageBase64 = await readFileAsBase64(skillPhotoFile);
        await handleSkillRun({ tool: "food_log_from_input", imageBase64 });
      } catch (err) {
        setError(err instanceof Error ? err.message : dialogCopy.skill.genericError);
      }
    })();
  }

  function handleTextSkillSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = skillText.trim();
    if (!text) return;
    void handleSkillRun({ tool: "food_log_from_input", text });
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
          source: hasProposal ? proposalSource : "manual",
          confidence: 1.0,
          similarToEventId: null,
          sources: null,
          notes: form.notes.trim() || null,
        };
        const event = await createFoodEvent(entry.id, payload);

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

  const tabs: Array<{ id: Mode; label: string }> = [
    { id: "manual", label: dialogCopy.tabs.manual },
  ];
  if (SKILL_RUN_ENABLED) {
    tabs.push({ id: "photo", label: dialogCopy.tabs.photo });
    tabs.push({ id: "text", label: dialogCopy.tabs.text });
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
      {tabs.length > 1 ? (
        <div className={styles.tabRow} role="tablist" data-testid="proposal-dialog-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              className={`${styles.tab} ${mode === tab.id ? styles.tabActive : ""}`}
              onClick={() => setMode(tab.id)}
              data-testid={`proposal-dialog-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

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

      {mode === "manual" ? (
        <>
          {hasProposal ? (
            <Notice tone="info" title={dialogCopy.skill.proposalTitle}>
              {dialogCopy.skill.proposalDescription}
            </Notice>
          ) : null}

          <form onSubmit={handleSubmit} className={styles.form}>
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
                <Select
                  value={form.mealSlot}
                  onChange={(e) => set("mealSlot", e.target.value)}
                  disabled={isPending}
                >
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
              <Input
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                disabled={isPending}
              />
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
              {hasProposal ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setHasProposal(false);
                    setForm(emptyForm);
                  }}
                >
                  {dialogCopy.skill.discardLabel}
                </Button>
              ) : null}
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? hasProposal
                    ? dialogCopy.skill.acceptingLabel
                    : dialogCopy.submittingLabel
                  : hasProposal
                    ? dialogCopy.skill.acceptLabel
                    : dialogCopy.submitLabel}
              </Button>
            </div>
          </form>
        </>
      ) : null}

      {mode === "photo" ? (
        <form onSubmit={handlePhotoSkillSubmit} className={styles.form}>
          <Field label={dialogCopy.photoLabel} description={dialogCopy.photoHint}>
            <input
              ref={skillFileRef}
              type="file"
              accept="image/*"
              disabled={skillIsRunning}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSkillPhotoFile(file);
              }}
              data-testid="proposal-dialog-skill-photo"
            />
          </Field>
          <div className={styles.actions}>
            <Button type="submit" disabled={skillIsRunning || !skillPhotoFile}>
              {skillIsRunning ? dialogCopy.skill.runningLabel : dialogCopy.skill.photoSubmitLabel}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "text" ? (
        <form onSubmit={handleTextSkillSubmit} className={styles.form}>
          <Field label={dialogCopy.tabs.text}>
            <Input
              value={skillText}
              onChange={(e) => setSkillText(e.target.value)}
              placeholder={dialogCopy.skill.textPlaceholder}
              disabled={skillIsRunning}
              data-testid="proposal-dialog-skill-text"
            />
          </Field>
          <div className={styles.actions}>
            <Button type="submit" disabled={skillIsRunning || skillText.trim().length === 0}>
              {skillIsRunning ? dialogCopy.skill.runningLabel : dialogCopy.skill.textSubmitLabel}
            </Button>
          </div>
        </form>
      ) : null}
    </OverlayPanel>
  );
}
