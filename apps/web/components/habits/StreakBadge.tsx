import { cn } from "../ui";
import type { StreakDescriptor } from "./streak";
import styles from "./StreakBadge.module.css";

type StreakBadgeProps = {
  descriptor: StreakDescriptor;
};

/**
 * A calm, non-gamified streak badge: a flame glyph + tabular streak count, the
 * frequency-aware caption, and — for count-based habits whose period isn't yet
 * met — a quiet "X more this week keeps your streak" nudge. No confetti, no
 * bouncing; the number does the talking.
 */
export function StreakBadge({ descriptor }: StreakBadgeProps) {
  return (
    <div className={cn(styles.badge, descriptor.atRisk && styles.atRisk)} data-testid="streak-badge">
      <div className={styles.headline}>
        <span className={styles.flame} aria-hidden="true">
          🔥
        </span>
        <span className={styles.value}>{descriptor.value}</span>
        <span className={styles.caption}>{descriptor.caption}</span>
        {descriptor.progress ? <span className={styles.progress}>{descriptor.progress}</span> : null}
      </div>
      {descriptor.hint ? <p className={styles.hint}>{descriptor.hint}</p> : null}
    </div>
  );
}
