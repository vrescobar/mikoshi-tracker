import type { ReactNode } from "react";

import { cn } from "./cn";
import styles from "./toggle.module.css";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  testId?: string;
};

/**
 * Accessible on/off switch (a real checkbox under the hood). Used for opt-ins
 * like the weekly WhatsApp report and circle share toggles — anything that is a
 * single boolean the user flips and that persists immediately.
 */
export function Toggle({ checked, onChange, label, description, disabled, className, testId }: ToggleProps) {
  return (
    <label className={cn(styles.row, className)} data-disabled={disabled ? "true" : "false"}>
      <span className={styles.copy}>
        <span className={styles.label}>{label}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
      <span className={styles.switch} data-checked={checked ? "true" : "false"}>
        <input
          type="checkbox"
          role="switch"
          className={styles.input}
          checked={checked}
          disabled={disabled}
          data-testid={testId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
      </span>
    </label>
  );
}
