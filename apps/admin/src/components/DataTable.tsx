import type { ReactNode } from "react";

import { EmptyState, ErrorBanner, TableSkeleton } from "./ui";

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  error,
  empty,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: string | null;
  empty?: { title: string; hint?: string; icon?: string };
  footer?: ReactNode;
}) {
  if (error) return <ErrorBanner message={error} />;
  if (loading && rows.length === 0) return <TableSkeleton />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{ textAlign: c.align ?? "left", width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? "clickable" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c, i) => (
                <td key={i} style={{ textAlign: c.align ?? "left" }} className={c.align === "right" ? "actions" : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  icon={empty?.icon}
                  title={empty?.title ?? "Nothing here yet"}
                  hint={empty?.hint}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footer}
    </div>
  );
}

export function Pager({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  return (
    <div className="table-foot">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="pager">
        <button className="btn ghost sm" disabled={!canPrev} onClick={() => onChange(Math.max(0, offset - limit))}>
          ‹ Prev
        </button>
        <button className="btn ghost sm" disabled={!canNext} onClick={() => onChange(offset + limit)}>
          Next ›
        </button>
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <span className="ico">⌕</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
