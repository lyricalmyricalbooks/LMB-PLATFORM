// Stockroom › Tax centre, drawn by the admin itself (read-only): the period's money in and out, by month and category,
// trips, standing costs, costs that may be missing, and the full ledger with a spreadsheet download. Every figure comes
// from the stockroom's own rules (moneyReports.ts); nothing here is saved.
import { useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";
import { downloadCsv } from "@stockroom/download.js";
import type { Delta } from "@stockroom/tax-ledger.js";

import { DataTable, EmptyState, MetricCard, Pagination, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import { RecordsGate } from "./RecordsGate";
import { LogExpenseCard, type Prefill } from "./LogExpense";
import { PendingExpensesCard } from "./PendingExpenses";
import { RecurringSubscriptionsCard } from "./RecurringSubscriptions";
import { SortingRulesCard } from "./SortingRules";
import { LedgerLineActions } from "./LedgerLineActions";
import { ReceiptsVaultCard } from "./ReceiptsVault";
import { isEditableLine } from "./taxLedger";
import type { SaveNote } from "./saveTaxCenter";
import { filterLedger, ledgerCsvFile, ledgerTotals, LEDGER_PAGE_SIZE, sourcesOf, taxCenterModel, type LedgerFilter } from "./moneyReports";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./money.css";

const deltaText = (d: Delta, prev: string | null) => {
  if (!d || !prev) return null;
  if (d.kind === "new") return `New: nothing in ${prev}`;
  const pct = Math.abs(d.pct);
  const arrow = d.dir === "flat" ? "→" : d.dir === "up" ? "▲" : "▼";
  return `${arrow} ${pct >= 100 ? Math.round(pct) : pct.toFixed(pct < 10 ? 1 : 0)}% vs ${prev}`;
};

const STATUS_TONE = { active: "success", scheduled: "info", paused: "neutral", ended: "neutral", invalid: "danger" } as const;
const STATUS_WORD = { active: "Active", scheduled: "Scheduled", paused: "Paused", ended: "Ended", invalid: "Needs a date" } as const;

/** Income against expenses for each month (or year), as bars. The table below it says the same in words. */
function CashFlowChart({ buckets, cur }: { buckets: Array<{ key: string; label: string; income: number; expense: number }>; cur: string }) {
  const max = Math.max(1, ...buckets.flatMap((b) => [b.income, b.expense]));
  const W = 640, H = 180, pad = 22, slot = (W - pad) / Math.max(1, buckets.length), bar = Math.max(3, Math.min(18, slot / 2 - 2));
  const y = (v: number) => H - pad - (v / max) * (H - pad - 8);
  return (
    <div>
      <p className="rp-money-legend"><span><i className="rp-in" style={{ background: "var(--rp-success)" }} />Money in</span><span><i style={{ background: "var(--rp-danger)" }} />Money out</span><span>Most: {fmt(max, cur)}</span></p>
      <svg className="rp-money-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money in and out for each period">
        <line x1={pad} x2={W} y1={H - pad} y2={H - pad} />
        {buckets.map((b, i) => {
          const x = pad + i * slot + slot / 2;
          return (
            <g key={b.key}>
              <rect className="rp-in" x={x - bar - 1} y={y(b.income)} width={bar} height={Math.max(0, H - pad - y(b.income))}><title>{`${b.label}: in ${fmt(b.income, cur)}`}</title></rect>
              <rect className="rp-out" x={x + 1} y={y(b.expense)} width={bar} height={Math.max(0, H - pad - y(b.expense))}><title>{`${b.label}: out ${fmt(b.expense, cur)}`}</title></rect>
              <text x={x} y={H - 6} textAnchor="middle">{b.label.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TaxCenterView({ records, now, onTaxCenter }: { records: StockroomRecords; now?: Date; onTaxCenter?: (taxCenter: Record<string, unknown>) => void }) {
  const w = useShopWords();
  const sources = useMemo(() => sourcesOf(records), [records]);
  const years = useMemo(() => taxCenterModel(sources, "all", now).years, [sources, now]);
  const [year, setYear] = useState("all");
  const [filter, setFilter] = useState<LedgerFilter>({ type: "all", query: "" });
  const [ledgerNote, setLedgerNote] = useState<SaveNote | null>(null);
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<Prefill | null>(null);
  const model = useMemo(() => taxCenterModel(sources, year, now), [sources, year, now]);
  const cur = model.baseCurrency;
  const money = (n: number) => fmt(n, cur);
  const shown = useMemo(() => filterLedger(model.rows, filter), [model.rows, filter]);
  const totals = ledgerTotals(shown);
  const pageCount = Math.max(1, Math.ceil(shown.length / LEDGER_PAGE_SIZE));
  const at = Math.min(page, pageCount);
  const slice = shown.slice((at - 1) * LEDGER_PAGE_SIZE, at * LEDGER_PAGE_SIZE);
  const s = model.summary;
  const download = () => { const file = ledgerCsvFile(shown, cur, now); downloadCsv(file.text, file.name); };

  return (
    <div className="rp-money">
      <div className="rp-filter-bar">
        <SelectField label="Period" value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }}>
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </SelectField>
      </div>
      {model.notes.missing > 0 && <p className="rp-money-note" role="status">{model.notes.missing} {model.notes.missing === 1 ? "line has" : "lines have"} no exchange rate yet and {model.notes.missing === 1 ? "is" : "are"} counted at 1 to 1, so these totals may be off. The stockroom fills rates in when it is opened.</p>}
      {!model.notes.missing && model.notes.estimated > 0 && <p className="rp-money-note" role="status">{model.notes.estimated} foreign-currency {model.notes.estimated === 1 ? "line is" : "lines are"} shown at the last saved exchange rate, not the rate of its own day. The stockroom replaces them with day rates when it is opened.</p>}

      <div className="rp-grid-metrics">
        <MetricCard label="Money in" value={money(s.sales)} footer={deltaText(s.deltas?.sales ?? null, s.prevYear)} tone="gold" />
        <MetricCard label="Money out" value={money(s.expenses)} footer={deltaText(s.deltas?.expenses ?? null, s.prevYear)} />
        <MetricCard label="Net" value={money(s.net)} footer={deltaText(s.deltas?.net ?? null, s.prevYear)} tone={s.net < 0 ? "danger" : undefined} />
      </div>
      <div className="rp-grid-metrics">
        <MetricCard label="Profit margin" value={s.profitMargin == null ? "-" : `${s.profitMargin.toFixed(1)}%`} />
        <MetricCard label="Sales" value={String(s.txnCount)} footer={`${s.unitsSold} ${s.unitsSold === 1 ? "copy" : "copies"}`} />
        <MetricCard label="Average sale" value={s.avgSale == null ? "-" : money(s.avgSale)} />
        <MetricCard label={w("Artist payouts")} value={money(s.artistPayouts)} footer="Not part of money out" />
        <MetricCard label="Net after payouts" value={money(s.netAfterPayouts)} tone={s.netAfterPayouts < 0 ? "danger" : undefined} />
      </div>

      <SectionCard title="Cash flow" description={year === "all" ? "Money in and out, year by year." : `Money in and out, month by month in ${year}.`}>
        <CashFlowChart buckets={model.buckets.filter((b) => b.income || b.expense || year !== "all")} cur={cur} />
      </SectionCard>

      {onTaxCenter && <LogExpenseCard taxCenter={records.taxCenter} onSaved={onTaxCenter} prefill={confirming} onPrefillDone={() => setConfirming(null)} />}
      {onTaxCenter && <PendingExpensesCard taxCenter={records.taxCenter} onSaved={onTaxCenter} onConfirm={setConfirming} />}
      {onTaxCenter && <RecurringSubscriptionsCard taxCenter={records.taxCenter} onSaved={onTaxCenter} now={now} />}
      {onTaxCenter && <SortingRulesCard taxCenter={records.taxCenter} onSaved={onTaxCenter} />}

      <SectionCard title={year === "all" ? "By year" : `By month in ${year}`} flush>
        <DataTable stackOnPhone caption="Money in and out by period" rowKey={(b) => b.key}
          rows={model.buckets.filter((b) => b.income || b.expense || year !== "all")}
          empty={<EmptyState inline title="Nothing recorded yet" />}
          columns={[
            { key: "p", header: "Period", lead: true, render: (b) => b.label },
            { key: "i", header: "In", numeric: true, render: (b) => money(b.income) },
            { key: "o", header: "Out", numeric: true, render: (b) => money(b.expense) },
            { key: "n", header: "Net", numeric: true, render: (b) => money(b.income - b.expense) },
          ]} />
      </SectionCard>

      <SectionCard title="Where the money went" description="What you can deduct, by category." flush>
        <DataTable stackOnPhone caption="Spending by category" rowKey={(c) => c.name} rows={model.categories.list}
          empty={<EmptyState inline title="No expenses in this period" />}
          columns={[
            { key: "c", header: "Category", lead: true, render: (c) => c.name },
            { key: "n", header: "Entries", numeric: true, render: (c) => c.count },
            { key: "s", header: "Spent", numeric: true, render: (c) => money(c.spent) },
            { key: "d", header: "Deductible", numeric: true, render: (c) => <>{money(c.total)}{c.rate < 1 && <span className="rp-money-sub"> {Math.round(c.rate * 100)}% allowed</span>}</> },
          ]} />
      </SectionCard>

      <SectionCard title="Trips and events" flush>
        <DataTable stackOnPhone caption="Trips" rowKey={(t) => t.name} rows={model.trips}
          empty={<EmptyState inline title="No trips in this period" />}
          columns={[
            { key: "t", header: "Trip", lead: true, render: (t) => t.name },
            { key: "d", header: "Dates", render: (t) => (t.minDate && t.maxDate ? (t.minDate === t.maxDate ? t.minDate : `${t.minDate} to ${t.maxDate}`) : "-") },
            { key: "n", header: "Expenses", numeric: true, render: (t) => t.count },
            { key: "s", header: "Spent", numeric: true, render: (t) => money(t.total) },
            { key: "x", header: "Deductible", numeric: true, render: (t) => money(t.deductible ?? t.total) },
          ]} />
      </SectionCard>

      {!onTaxCenter && (
      <SectionCard title="Standing costs" description={model.recurring.length ? `About ${money(model.recurringSummary.monthlyBase)} a month, ${money(model.recurringSummary.annualBase)} a year.` : undefined} flush>
        <DataTable stackOnPhone caption="Standing costs" rowKey={(r) => r.id} rows={model.recurring}
          empty={<EmptyState inline title="No standing costs tracked" description="Hosting, software or rent that repeats shows up here." />}
          columns={[
            { key: "d", header: "Cost", lead: true, render: (r) => <>{r.desc}{(r.vendor || r.cat) && <span className="rp-money-sub"> {[r.vendor, r.cat].filter(Boolean).join(" · ")}</span>}</> },
            { key: "a", header: "Amount", numeric: true, render: (r) => `${fmt(r.amount, r.currency)} ${r.every.toLowerCase()}` },
            { key: "s", header: "Status", render: (r) => <StatusBadge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{STATUS_WORD[r.status as keyof typeof STATUS_WORD]}</StatusBadge> },
            { key: "x", header: "Next charge", render: (r) => r.next || "-" },
          ]} />
      </SectionCard>
      )}

      <SectionCard title="Costs that may be missing" description="Gaps in your own records, not tax advice." flush={!model.gaps.gaps.length}>
        {model.gaps.gaps.length === 0
          ? <EmptyState inline title="Nothing obviously missing" description="Checked again each time you open this page." />
          : <ul className="rp-money-gaps">
              {model.gaps.gaps.map((g) => (
                <li key={g.id}>
                  <strong>{g.title}</strong> <StatusBadge glyph={false}>{g.category}</StatusBadge>
                  {g.estimate != null && <span className="rp-money-sub"> about {money(g.estimate)}</span>}
                  <p>{g.detail}</p>
                </li>
              ))}
            </ul>}
      </SectionCard>

      <SectionCard title="Ledger" actions={<SecondaryButton onClick={download} disabled={!shown.length}>Download spreadsheet</SecondaryButton>} flush>
        <div className="rp-money-pad">
          <div className="rp-filter-bar">
            <div className="rp-grow"><SearchField label="Search the ledger" value={filter.query} onChange={(e) => { setFilter({ ...filter, query: e.target.value }); setPage(1); }} /></div>
            <SelectField label="Show" value={filter.type} onChange={(e) => { setFilter({ ...filter, type: e.target.value as LedgerFilter["type"] }); setPage(1); }}>
              <option value="all">Everything</option><option value="sales">Money in</option><option value="expenses">Money out</option>
            </SelectField>
          </div>
        </div>
        {ledgerNote && <div className="rp-money-pad"><p className="rp-sr-save" data-tone={ledgerNote.tone} role={ledgerNote.tone === "error" ? "alert" : "status"}>{ledgerNote.text}</p></div>}
        <DataTable stackOnPhone caption="Ledger" rowKey={(r) => `${r.sourceType}:${r.sourceId || ""}:${r.itemId}:${r.date}:${r.desc}`} rows={slice}
          empty={<EmptyState inline title="No entries match" />}
          columns={[
            { key: "d", header: "Date", render: (r) => r.date || "-" },
            { key: "t", header: "Type", render: (r) => <>{r.type}{r.voided && <StatusBadge glyph={false}>Voided</StatusBadge>}</> },
            { key: "e", header: "Description", lead: true, render: (r) => r.desc },
            { key: "c", header: "Category", render: (r) => (onTaxCenter && isEditableLine(r)
              ? <LedgerLineActions line={r} onSaved={onTaxCenter} onNote={setLedgerNote} />
              : r.cat || "") },
            { key: "o", header: "Original", numeric: true, render: (r) => `${fmt(Number(r.origAmount || 0), r.origCurrency || cur)}` },
            { key: "b", header: cur, numeric: true, render: (r) => <span className={r.isIncome ? "rp-money-in" : "rp-money-out"}>{r.isIncome ? "+" : "-"}{fmt(Number(r.baseAmount || 0), cur)}</span> },
          ]} />
        {shown.length > 0 && (
          <div className="rp-money-pad">
            <p className="rp-money-foot">{shown.length} {shown.length === 1 ? "entry" : "entries"}: in <strong>{money(totals.income)}</strong>, out <strong>{money(totals.expense)}</strong>, net <strong>{money(totals.net)}</strong></p>
            {pageCount > 1 && <Pagination page={at} pageCount={pageCount} onPage={setPage} />}
          </div>
        )}
      </SectionCard>

      <ReceiptsVaultCard rows={model.rows} money={money} onSaved={onTaxCenter} />
    </div>
  );
}

export function TaxCenterPage({ load = stockroomApi.load }: { load?: () => Promise<StockroomRecords>; onOpen?: unknown; isPage?: unknown }) {
  return <RecordsGate load={load} what="the Tax centre">{(records) => <TaxCenterLive initial={records} />}</RecordsGate>;
}

/** Keeps the records on screen and swaps in the Tax centre as the save returned it (other devices' rows included). */
function TaxCenterLive({ initial }: { initial: StockroomRecords }) {
  const [records, setRecords] = useState(initial);
  return <TaxCenterView records={records} onTaxCenter={(taxCenter) => setRecords((r) => ({ ...r, taxCenter }))} />;
}
