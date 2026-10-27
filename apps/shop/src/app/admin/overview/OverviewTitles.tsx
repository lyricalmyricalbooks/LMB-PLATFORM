import { useMemo, useState } from "react";
import { DataTable, EmptyState, GhostButton, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, type Column } from "../riso/components";
import { sortTitles, titlesCsv, TITLE_SORTS, type TitleRow, type TitleSort } from "./overviewProfit";
import { TITLE_FLAG_WORDS, titleFlags } from "./overviewSignals";
import { money, percent } from "./OverviewParts";

const PAGE = 25;

/** Overview › Dig deeper › Titles: every title's sales, change, interest, profit and stock for the period. */
export function OverviewTitles({ rows, startKey, endKey, viewsRecorded, addsRecorded = false, costsKnown, onEditBook, fetchingBookId }: {
  rows: TitleRow[]; startKey: string; endKey: string; viewsRecorded: boolean; addsRecorded?: boolean; costsKnown: boolean;
  onEditBook: (id: string) => void; fetchingBookId: string | null;
}) {
  const [sort, setSort] = useState<TitleSort>("revenue");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTitles(q ? rows.filter(r => r.title.toLowerCase().includes(q)) : rows, sort);
  }, [rows, sort, query]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([titlesCsv(sorted, startKey, endKey)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `titles-${startKey}-to-${endKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Flags are judged against the shop's own rates (titleFlags), and only the few clearest titles keep one.
  const flags = useMemo(() => (addsRecorded ? titleFlags(rows) : new Map<string, "browsed" | "abandoned">()), [rows, addsRecorded]);
  const change = (r: TitleRow) => {
    if (r.prevUnits === 0 && r.units === 0) return <StatusBadge tone="neutral" glyph={false}>—</StatusBadge>;
    if (r.prevUnits === 0) return <StatusBadge tone="info" glyph={false}>new</StatusBadge>;
    const d = r.units - r.prevUnits;
    return <StatusBadge tone={d > 0 ? "success" : d < 0 ? "danger" : "neutral"} glyph={d > 0 ? "▲" : d < 0 ? "▼" : false}>{d === 0 ? "same" : `${d > 0 ? "up " : "down "}${Math.abs(d)}`}</StatusBadge>;
  };
  const columns: Column<TitleRow>[] = [
    { key: "title", header: "Title", lead: true, render: r => (<>
      <GhostButton size="sm" onClick={() => onEditBook(r.id)} disabled={fetchingBookId === r.id} aria-label={`Edit ${r.title}`}
        style={{ padding: 0, textAlign: "left", whiteSpace: "normal", textTransform: "none", letterSpacing: 0, fontSize: "var(--rp-text-base)" }}>{r.title}</GhostButton>
    </>) },
    ...(addsRecorded && flags.size ? [{ key: "flag", header: "Worth a look", render: (r: TitleRow) => {
      const f = flags.get(r.id);
      return f ? <span title={TITLE_FLAG_WORDS[f].hint}><StatusBadge tone="warning" glyph="!">{TITLE_FLAG_WORDS[f].badge}</StatusBadge></span> : null;
    } }] : []),
    { key: "units", header: "Sold", numeric: true, render: r => r.units.toLocaleString() },
    { key: "change", header: "vs before", render: change },
    { key: "revenue", header: "Net revenue", numeric: true, render: r => money(r.revenue) },
    ...(viewsRecorded ? [
      { key: "views", header: "Views", numeric: true, render: (r: TitleRow) => (r.views === null ? "—" : r.views.toLocaleString()) },
      ...(addsRecorded ? [{ key: "adds", header: "Into bag", numeric: true, render: (r: TitleRow) => (r.adds === null ? "—" : r.adds.toLocaleString()) }] : []),
      { key: "conv", header: "Views → sale", numeric: true, render: (r: TitleRow) => (r.viewToSale === null ? "—" : percent(r.viewToSale)) },
    ] : []),
    ...(costsKnown ? [
      { key: "profit", header: "Profit", numeric: true, render: (r: TitleRow) => (r.profit === null ? <span title="No cost price saved for this book">cost?</span> : money(r.profit)) },
      { key: "margin", header: "Margin", numeric: true, render: (r: TitleRow) => (r.margin === null ? "—" : percent(r.margin, 0)) },
    ] : []),
    { key: "stock", header: "Stock", numeric: true, render: r => (r.stock === null ? "—" : r.coverDays !== null ? `${r.stock} · ~${r.coverDays}d` : r.stock) },
  ];

  return (
    <SectionCard flush title="Every title" description={`${sorted.length} title${sorted.length === 1 ? "" : "s"} sold, sold before, or viewed in this period. Revenue is after each order's discount and partial refunds.`}
      actions={<SecondaryButton size="sm" onClick={download} disabled={sorted.length === 0}>Download (CSV)</SecondaryButton>}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "0 20px 12px" }}>
        <div style={{ flex: "1 1 220px" }}><SearchField label="Find a title" placeholder="Find a title" value={query} onChange={e => { setQuery(e.target.value); setShown(PAGE); }} /></div>
        <div style={{ flex: "0 1 220px" }}>
          <SelectField label="Sort by" value={sort} onChange={e => setSort(e.target.value as TitleSort)}>
            {TITLE_SORTS.filter(s => (viewsRecorded || (s.id !== "views" && s.id !== "conversion")) && (addsRecorded || s.id !== "adds") && (costsKnown || (s.id !== "profit" && s.id !== "margin")))
              .map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </SelectField>
        </div>
      </div>
      {sorted.length === 0
        ? <EmptyState title={query ? "No title matches" : "Nothing sold or viewed"} description={query ? "Try another word." : "Titles appear once they sell or shoppers look at them."} />
        : <DataTable caption="Every title" columns={columns} rows={sorted.slice(0, shown)} rowKey={r => r.id} />}
      {sorted.length > shown && (
        <div style={{ padding: "12px 20px 16px" }}><SecondaryButton size="sm" onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, sorted.length - shown)} more</SecondaryButton></div>
      )}
      {flags.size > 0 && (
        <p className="rp-hint" style={{ padding: "12px 20px 0", margin: 0 }}>
          Worth a look = the {flags.size === 1 ? "title" : `${flags.size} titles`} furthest below the shop's own rate.{" "}
          {[...new Set(flags.values())].map(f => <span key={f}><strong>{TITLE_FLAG_WORDS[f].badge}</strong>: {TITLE_FLAG_WORDS[f].hint} </span>)}
        </p>
      )}
      {!costsKnown && (
        <p className="rp-hint" style={{ padding: "12px 20px 16px", margin: 0 }}>Add cost prices in Inventory (or Books › edit › Pricing) to see profit and margin per title.</p>
      )}
    </SectionCard>
  );
}
