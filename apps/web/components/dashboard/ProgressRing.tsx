import styles from "./ProgressRing.module.css";

type ProgressRingProps = {
  /** 0–1. */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  sublabel?: string;
  /** CSS color for the progress arc (defaults to emerald accent). */
  color?: string;
};

/**
 * A big, friendly circular progress ring — the focal point of the dashboard.
 * Pure SVG, animates the arc on mount via a CSS transition on the dash offset.
 */
export function ProgressRing({
  value,
  size = 132,
  stroke = 12,
  label,
  sublabel,
  color = "var(--color-accent)",
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.svg}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-neutral-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={styles.arc}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.center}>
        <span className={styles.label}>{label}</span>
        {sublabel ? <span className={styles.sublabel}>{sublabel}</span> : null}
      </div>
    </div>
  );
}
