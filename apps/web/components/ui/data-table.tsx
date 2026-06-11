import type { ReactNode } from "react";

import { cn } from "./cn";
import { SkeletonBlock, StatePanel } from "./state";
import styles from "./data-table.module.css";

export interface DataTableColumn<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: string | null;
  empty?: { title: string; hint?: string; icon?: string };
  footer?: ReactNode;
  testId?: string;
};

/**
 * Tabular list on the shared design tokens (rebuild of the retired admin
 * SPA's DataTable). Loading renders skeleton rows; an error renders a danger
 * StatePanel; an empty result renders the provided empty copy in-table.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  error,
  empty,
  footer,
  testId,
}: DataTableProps<T>) {
  if (error) {
    return <StatePanel tone="danger" title={error} compact />;
  }

  if (loading && rows.length === 0) {
    return (
      <div className={styles.wrap} data-testid={testId} aria-busy="true">
        <div style={{ display: "grid", gap: "0.5rem", padding: "0.85rem" }}>
          <SkeletonBlock height="1.2rem" />
          <SkeletonBlock height="1.2rem" />
          <SkeletonBlock height="1.2rem" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-testid={testId}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                className={cn(column.align === "right" && styles.alignRight)}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? styles.clickable : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column, index) => (
                <td key={index} className={cn(column.align === "right" && styles.alignRight)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={styles.emptyCell}>
                {empty?.icon ? <div aria-hidden="true">{empty.icon}</div> : null}
                {empty?.title ?? "Nothing here yet"}
                {empty?.hint ? <div>{empty.hint}</div> : null}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}
