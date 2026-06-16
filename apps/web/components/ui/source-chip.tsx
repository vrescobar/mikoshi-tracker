import type { HTMLAttributes } from "react";

import type { EventSource } from "@mikoshi-tracker/contracts/events";

import { cn } from "./cn";
import styles from "./source-chip.module.css";

type SourceChipProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** Provenance of the underlying mutation: who wrote this value. */
  source: EventSource;
  /**
   * Localized label (e.g. "Mikoshi", "You"). When omitted the chip is glyph-only
   * and still carries an accessible label via `aria-label`/`title`.
   */
  label?: string;
  /** When false, render only the glyph (dense rows). Defaults to showing label. */
  showLabel?: boolean;
};

const GLYPH: Record<EventSource, string> = {
  WEB: "🌐",
  AI: "🤖",
  SYSTEM: "⚙",
  CIRCLE: "⭕",
};

const FALLBACK_LABEL: Record<EventSource, string> = {
  WEB: "Web",
  AI: "Mikoshi",
  SYSTEM: "System",
  CIRCLE: "Circle",
};

/**
 * A calm provenance marker shown on any value the GUI displays, so an AI- or
 * circle-written entry is never indistinguishable from a hand-entered one. This
 * is what makes the GUI trustworthy as an inspection surface over skill writes.
 */
export function SourceChip({ source, label, showLabel = true, className, ...props }: SourceChipProps) {
  const text = label ?? FALLBACK_LABEL[source];
  return (
    <span
      className={cn(styles.chip, styles[`source${source}`], className)}
      data-source={source}
      title={text}
      aria-label={text}
      {...props}
    >
      <span className={styles.glyph} aria-hidden="true">
        {GLYPH[source]}
      </span>
      {showLabel ? <span className={styles.label}>{text}</span> : null}
    </span>
  );
}
