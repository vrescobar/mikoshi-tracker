import type { KeyboardEvent, ReactNode } from "react";
import { useRef } from "react";

import { cn } from "./cn";
import { Icon, type IconName } from "./icon";
import styles from "./tabs.module.css";

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: IconName;
};

type TabsProps = {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
  /** "segmented" pill group (default) or "underline" page tabs. */
  variant?: "segmented" | "underline";
};

/**
 * Accessible tablist (roving focus, arrow-key navigation). The component renders
 * only the tab strip; the parent owns `active` and renders the matching panel —
 * which keeps panel data loading and layout under the page's control.
 */
export function Tabs({ items, active, onChange, ariaLabel, className, variant = "segmented" }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className={cn(styles.tablist, styles[variant], className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            data-selected={selected ? "true" : "false"}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.icon ? (
              <span className={styles.tabIcon} aria-hidden="true">
                <Icon name={item.icon} size="1.05rem" />
              </span>
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Wraps a tab's content with the right ARIA wiring against the Tabs above. */
export function TabPanel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`} className={className} tabIndex={0}>
      {children}
    </div>
  );
}
