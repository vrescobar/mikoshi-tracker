// Pager + SearchBox from the retired admin SPA's components/DataTable.tsx.
// The table itself is the shared <DataTable> in components/ui; these two
// list-chrome helpers had no equivalent there, so they live with the views.

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
