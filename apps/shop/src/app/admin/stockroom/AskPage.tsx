// Stockroom › Ask about your sales, drawn by the admin itself (read-only). Ready-made questions answered straight from
// your records by the stockroom's own read-only tools (the ones its assistant is grounded in), so nothing is sent
// anywhere and no AI key is needed. Typing a question in your own words is not part of this page yet.
import { useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { DataTable, EmptyState, MetricCard, SectionCard, SelectField, StatusBadge, Tabs } from "../riso/components";
import { useShopWords } from "../shopWords";
import { RecordsGate } from "./RecordsGate";
import { ASK_QUESTIONS, askModel, sourcesOf, type AskId } from "./moneyReports";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./money.css";

type Row = Record<string, any>;
const SEVERITY = { high: "danger", medium: "warning", low: "neutral" } as const;

function Answer({ id, data }: { id: AskId; data: Row }) {
  const w = useShopWords();
  const cutNote = data.truncated ? <p className="rp-money-note">Showing {data.returned} of {data.matched} rows. The totals count all of them.</p> : null;
  if (data.error) return <EmptyState inline title="This couldn't be answered" description={String(data.error)} />;
  if (id === "sold") {
    return (
      <>
        <div className="rp-grid-metrics">{(data.totalsByCurrency as Row[]).map((t) => <MetricCard key={t.code} label={`Sold in ${t.code}`} value={fmt(t.revenue, t.code)} footer={`${t.units} ${t.units === 1 ? "copy" : "copies"}`} />)}</div>
        <SectionCard title="By place sold" flush>
          <DataTable stackOnPhone caption="Sales by place" rowKey={(c) => c.channel} rows={data.byChannel as Row[]} empty={<EmptyState inline title="No sales in this period" />}
            columns={[{ key: "c", header: "Place", lead: true, render: (c) => c.channel }, { key: "u", header: "Copies", numeric: true, render: (c) => c.units }, { key: "r", header: "Takings", numeric: true, render: (c) => (c.currencies as string[]).map((code) => fmt(c.revenue, code)).join(" / ") }]} />
        </SectionCard>
        <SectionCard title={w("By book")} flush>
          <DataTable stackOnPhone caption="Sales by item" rowKey={(b) => b.bookId} rows={data.byBook as Row[]} empty={<EmptyState inline title="No sales in this period" />}
            columns={[{ key: "b", header: w("Book"), lead: true, render: (b) => b.book }, { key: "u", header: "Copies", numeric: true, render: (b) => b.units }, { key: "r", header: "Takings", numeric: true, render: (b) => fmt(b.revenue, b.currency) }]} />
        </SectionCard>
        <p className="rp-money-note">{data.note}</p>
      </>
    );
  }
  if (id === "spent") {
    return (
      <>
        <div className="rp-grid-metrics">
          {(data.totalsByCurrency as Row[]).map((t) => <MetricCard key={t.code} label={`Spent in ${t.code}`} value={fmt(t.revenue, t.code)} />)}
          <MetricCard label="No receipt" value={String(data.missingReceipts)} tone={data.missingReceipts ? "warn" : undefined} />
        </div>
        <SectionCard title="By category" flush>
          <DataTable stackOnPhone caption="Spending by category" rowKey={(c) => c.category} rows={data.byCategory as Row[]} empty={<EmptyState inline title="No expenses in this period" />}
            columns={[{ key: "c", header: "Category", lead: true, render: (c) => c.category }, { key: "n", header: "Entries", numeric: true, render: (c) => c.count }, { key: "t", header: "Total", numeric: true, render: (c) => ((c.currencies as string[]).length === 1 ? fmt(c.total, c.currencies[0]) : `${fmt(c.total, "CAD")} (as recorded)`) }]} />
        </SectionCard>
        {cutNote}
      </>
    );
  }
  if (id === "cash") {
    return (
      <div className="rp-grid-metrics">
        <MetricCard label="Money in" value={fmt(data.totals.incomeCAD, "CAD")} tone="gold" />
        <MetricCard label="Money out" value={fmt(data.totals.expensesCAD, "CAD")} />
        <MetricCard label="Net" value={fmt(data.totals.netCAD, "CAD")} tone={data.totals.netCAD < 0 ? "danger" : undefined} footer={data.totals.rowsWithMissingRate ? `${data.totals.rowsWithMissingRate} lines have no exchange rate` : undefined} />
      </div>
    );
  }
  if (id === "events") {
    return (
      <>
        <DataTable stackOnPhone caption="Fairs and trips" rowKey={(e) => e.name} rows={data.rows as Row[]} empty={<EmptyState title="No fairs or trips" description="Tag expenses with a trip in the Tax centre and it shows here." />}
          columns={[
            { key: "n", header: "Event", lead: true, render: (e) => e.name },
            { key: "d", header: "Dates", render: (e) => (e.startDate ? `${e.startDate}${e.endDate && e.endDate !== e.startDate ? ` to ${e.endDate}` : ""}` : "-") },
            { key: "s", header: "Spent", numeric: true, render: (e) => fmt(e.spendCAD, "CAD") },
            { key: "u", header: "Copies sold", numeric: true, render: (e) => e.salesUnits },
            { key: "m", header: "Margin", numeric: true, render: (e) => (e.marginCAD == null ? "-" : fmt(e.marginCAD, "CAD")) },
          ]} />
        {cutNote}
      </>
    );
  }
  if (id === "stock") {
    return (
      <DataTable stackOnPhone caption="Stock" rowKey={(b) => b.bookId} rows={data.rows as Row[]} empty={<EmptyState title={w("No books yet")} />}
        columns={[
          { key: "t", header: w("Book"), lead: true, render: (b) => b.title },
          { key: "o", header: "On hand", numeric: true, render: (b) => b.onHand },
          { key: "p", header: "Print run", numeric: true, render: (b) => b.printRun || "-" },
          { key: "l", header: "Running low at", numeric: true, render: (b) => b.lowStockThreshold || "-" },
        ]} />
    );
  }
  if (id === "wrong") {
    return (
      <>
        <p className="rp-money-note">{data.scanned} expenses checked.</p>
        <DataTable stackOnPhone caption="Things that look wrong" rowKey={(f) => `${f.kind}:${f.expenseId}:${f.date}:${f.description}`} rows={data.rows as Row[]}
          empty={<EmptyState icon="✅" title="Nothing looks wrong" description="Every rule passed on the expenses checked." />}
          columns={[
            { key: "s", header: "How much", render: (f) => <StatusBadge tone={SEVERITY[f.severity as keyof typeof SEVERITY]}>{f.severity}</StatusBadge> },
            { key: "d", header: "Expense", lead: true, render: (f) => `${f.date} ${f.description}` },
            { key: "x", header: "What's wrong", render: (f) => f.detail },
          ]} />
        {cutNote}
      </>
    );
  }
  return (
    <>
      <DataTable stackOnPhone caption="Costs that may be missing" rowKey={(g) => g.id} rows={data.rows as Row[]}
        empty={<EmptyState icon="✅" title="Nothing obviously missing" />}
        columns={[
          { key: "t", header: "Cost", lead: true, render: (g) => g.title },
          { key: "d", header: "Why", render: (g) => g.detail },
          { key: "a", header: "About", numeric: true, render: (g) => (g.likelyAmount == null ? "-" : fmt(g.likelyAmount, "CAD")) },
        ]} />
      <p className="rp-money-note">These are gaps in your own records, not tax advice.</p>
    </>
  );
}

export function AskView({ records, now }: { records: StockroomRecords; now?: Date }) {
  const sources = useMemo(() => sourcesOf(records), [records]);
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const t of [...Object.values(records.states).flatMap((s) => [...((s.hist as Row[]) || []), ...((s.expenses as Row[]) || [])]), ...(((records.taxCenter?.businessExpenses as Row[]) || []))]) {
      const y = String(t?.date || "").slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(y);
    }
    return [...set].sort().reverse();
  }, [records]);
  const [id, setId] = useState<AskId>("sold");
  const [year, setYear] = useState("all");
  const data = useMemo(() => askModel(sources, id, year, now), [sources, id, year, now]);
  return (
    <div className="rp-money">
      <div className="rp-filter-bar">
        <SelectField label="Period" value={year} onChange={(e) => setYear(e.target.value)} disabled={id === "stock" || id === "missing"}>
          <option value="all">All time</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </SelectField>
      </div>
      <Tabs label="Questions" tabs={ASK_QUESTIONS.map((q) => ({ id: q.id, label: q.label }))} value={id} onChange={setId} />
      <div role="tabpanel" aria-label={ASK_QUESTIONS.find((q) => q.id === id)?.label} className="rp-money-answer"><Answer id={id} data={data} /></div>
    </div>
  );
}

export function AskPage({ load = stockroomApi.load }: { load?: () => Promise<StockroomRecords>; onOpen?: unknown; isPage?: unknown }) {
  return <RecordsGate load={load} what="your sales answers">{(records) => <AskView records={records} />}</RecordsGate>;
}
