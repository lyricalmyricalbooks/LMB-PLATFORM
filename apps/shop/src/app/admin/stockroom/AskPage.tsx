// Stockroom › Ask about your sales, drawn by the admin itself (read-only). Ready-made questions answered straight from
// your records by the stockroom's own read-only tools (the ones its assistant is grounded in), so nothing is sent
// anywhere and no AI key is needed. Typing a question in your own words is not part of this page yet.
import { useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { DataTable, Drawer, EmptyState, MetricCard, PageActions, SecondaryButton, SectionCard, SelectField, StatusBadge, Tabs } from "../riso/components";
import { lowStockThreshold } from "../inventoryInsights";
import { buildReorder } from "../reorderList";
import { buildSalesRows } from "./sales";
import { useShopWords } from "../shopWords";
import { RecordsGate } from "./RecordsGate";
import { useRatedRecords } from "./taxRates";
import { ASK_QUESTIONS, askModel, sourcesOf, type AskId } from "./moneyReports";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./money.css";
import { SHOP_CURRENCY } from "../moneySign";

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
            columns={[{ key: "c", header: "Category", lead: true, render: (c) => c.category }, { key: "n", header: "Entries", numeric: true, render: (c) => c.count }, { key: "t", header: "Total", numeric: true, render: (c) => ((c.currencies as string[]).length === 1 ? fmt(c.total, c.currencies[0]) : `${fmt(c.total, SHOP_CURRENCY)} (as recorded)`) }]} />
        </SectionCard>
        {cutNote}
      </>
    );
  }
  if (id === "cash") {
    return (
      <div className="rp-grid-metrics">
        <MetricCard label="Money in" value={fmt(data.totals.incomeCAD, SHOP_CURRENCY)} tone="gold" />
        <MetricCard label="Money out" value={fmt(data.totals.expensesCAD, SHOP_CURRENCY)} />
        <MetricCard label="Net" value={fmt(data.totals.netCAD, SHOP_CURRENCY)} tone={data.totals.netCAD < 0 ? "danger" : undefined} footer={data.totals.rowsWithMissingRate ? `${data.totals.rowsWithMissingRate} lines have no exchange rate` : undefined} />
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
            { key: "s", header: "Spent", numeric: true, render: (e) => fmt(e.spendCAD, SHOP_CURRENCY) },
            { key: "u", header: "Copies sold", numeric: true, render: (e) => e.salesUnits },
            { key: "m", header: "Margin", numeric: true, render: (e) => (e.marginCAD == null ? "-" : fmt(e.marginCAD, SHOP_CURRENCY)) },
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
          { key: "a", header: "About", numeric: true, render: (g) => (g.likelyAmount == null ? "-" : fmt(g.likelyAmount, SHOP_CURRENCY)) },
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

const DAY = 24 * 60 * 60 * 1000;

/** Money › Insights (redesign): the best seller and best channel of the last 90 days, then what is worth knowing. */
export function InsightsView({ records, now = new Date() }: { records: StockroomRecords; now?: Date }) {
  const w = useShopWords();
  const [asking, setAsking] = useState(false);
  const { seller, channel, notes } = useMemo(() => {
    const from = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
    const sold = buildSalesRows(records).filter((r) => r.kind === "sale" && !r.voided && !r.gift && r.date >= from);
    const top = (key: (r: (typeof sold)[number]) => string) => {
      const by = new Map<string, number>();
      sold.forEach((r) => by.set(key(r), (by.get(key(r)) || 0) + r.qty));
      return [...by.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    };
    const copies = sold.reduce((n, r) => n + r.qty, 0);
    const ch = top((r) => r.channel);
    const reorder = buildReorder({ stockroom: records, shopBooks: [], paidOrders: [], shopThreshold: lowStockThreshold(null), now: now.getTime() });
    return {
      seller: top((r) => r.bookTitle),
      channel: ch ? { name: ch[0], share: copies ? Math.round((ch[1] / copies) * 100) : 0 } : null,
      notes: reorder.map((r) => ({
        key: r.key,
        text: r.onHand <= 0 ? `${r.title} is sold out` : r.weeksLeft !== null ? `${r.title} sells out in about ${Math.max(1, Math.round(r.weeksLeft))} ${Math.max(1, Math.round(r.weeksLeft)) === 1 ? "week" : "weeks"}` : `${r.title} is running low`,
        urgent: r.onHand <= 0 || (r.weeksLeft !== null && r.weeksLeft < 2),
      })),
    };
  }, [records, now]);
  return (
    <div className="rp-money">
      <PageActions><SecondaryButton onClick={() => setAsking(true)}>Ask about your sales</SecondaryButton></PageActions>
      <div className="rp-tiles">
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">{w("Best seller")}, 90 days</span>
          <span className="rp-tile-value">{seller ? seller[0] : "–"}</span>
          <span className="rp-tile-sub">{seller ? `${seller[1]} ${seller[1] === 1 ? w("copy") : w("copies")}` : "No sales yet"}</span>
        </div>
        <div className="rp-tile" data-tone="sky">
          <span className="rp-tile-label">Best channel</span>
          <span className="rp-tile-value">{channel ? channel.name : "–"}</span>
          <span className="rp-tile-sub">{channel ? `${channel.share}% of sales` : "No sales yet"}</span>
        </div>
      </div>
      <section className="rp-card rp-worth" aria-labelledby="rp-worth-title">
        <h2 className="rp-card-title" id="rp-worth-title">Worth knowing</h2>
        {notes.length ? (
          <ul className="rp-worth-list">
            {notes.map((n) => (
              <li key={n.key}><span>{n.text}</span><StatusBadge glyph={false} tone={n.urgent ? "danger" : "warning"}>{n.urgent ? "Reprint now" : "Reprint"}</StatusBadge></li>
            ))}
          </ul>
        ) : <p className="rp-hint">{w("Nothing needs you: every book has stock for a while.")}</p>}
      </section>
      <Drawer open={asking} onClose={() => setAsking(false)} title="Ask about your sales" description="Answered from your own records.">
        {asking && <AskView records={records} now={now} />}
      </Drawer>
    </div>
  );
}

export function AskPage({ load = stockroomApi.load }: { load?: () => Promise<StockroomRecords>; onOpen?: unknown; isPage?: unknown }) {
  return <RecordsGate load={load} what="your insights">{(records) => <InsightsLive initial={records} />}</RecordsGate>;
}

function InsightsLive({ initial }: { initial: StockroomRecords }) {
  const [records] = useRatedRecords(initial);
  return <InsightsView records={records} />;
}
