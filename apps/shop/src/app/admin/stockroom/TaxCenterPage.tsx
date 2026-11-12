// Stockroom › Tax centre, drawn by the admin itself. The top (TaxTop.tsx, to the mockup) is sales tax for a quarter
// from the shop's orders; below it, the stockroom's own cards: the period's money in and out, by month and category,
// trips, standing costs, costs that may be missing, and the full ledger with a spreadsheet download. Every figure comes
// from the stockroom's own rules (moneyReports.ts); nothing here is saved.
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";
import { downloadCsv } from "@stockroom/download.js";
import type { Delta } from "@stockroom/tax-ledger.js";

import { DataTable, Dialog, EmptyState, GhostButton, MetricCard, Pagination, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, Tabs } from "../riso/components";
import { useShopSells, useShopWords } from "../shopWords";
import { hasPublisherTools } from "../../../shared/shopSells";
import { getOrdersCached } from "../ordersCache";
import { TaxTop } from "./TaxTop";
import { taxPeriods } from "./taxPeriods";
import { RecordsGate } from "./RecordsGate";
import { useRatedRecords } from "./taxRates";
import { LogExpenseCard, type Prefill } from "./LogExpense";
import { LogSeveralCard } from "./LogSeveral";
import { PendingExpensesCard } from "./PendingExpenses";
import { RecurringSubscriptionsCard } from "./RecurringSubscriptions";
import { SortingRulesCard } from "./SortingRules";
import { LedgerLineActions } from "./LedgerLineActions";
import { ReceiptsVaultCard } from "./ReceiptsVault";
import { TaxSeasonCard } from "./TaxSeasonCard";
import { StockValueCard } from "./StockValueCard";
import { TripsCard, type TripRow } from "./TripsCard";
import { isEditableLine } from "./taxLedger";
import type { SaveNote } from "./saveTaxCenter";
import { GapsCard } from "./GapsCard";
import { YearReportCard } from "./YearReportCard";
import { CardFeesCard } from "./CardFeesCard";
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
              <text x={x} y={H - 6} textAnchor="middle">{/^\d{4}$/.test(b.label) ? b.label : b.label.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** v4: the Tax centre is eight pages (riso/nav.ts); each draws one part. "all" draws everything on one page. */
export type TaxPart = "all" | "money" | "ledger" | "costs" | "salestax" | "rates" | "filings" | "yearend";
const YEAR_PARTS: TaxPart[] = ["money", "ledger", "yearend"];

export function TaxCenterView({ records, now, onTaxCenter, onState, orders: givenOrders, part = "all" }: {
  records: StockroomRecords; part?: TaxPart; now?: Date; onTaxCenter?: (taxCenter: Record<string, unknown>) => void; onState?: (bookId: string, state: Record<string, unknown>) => void;
  /** The shop's orders (tests and the fixture pass them; otherwise read through the shared copy). */
  orders?: Record<string, any>[];
}) {
  const w = useShopWords();
  const sells = useShopSells();
  const sources = useMemo(() => sourcesOf(records), [records]);
  const nowMs = (now || new Date()).getTime();
  const periods = useMemo(() => taxPeriods(nowMs), [nowMs]);
  const [periodId, setPeriodId] = useState(periods[0].id);
  const period = periods.find((p) => p.id === periodId) || periods[0];
  // The cards below follow the period's year; the pages without period pills pick a year of their own.
  const on = (p: TaxPart) => part === "all" || part === p;
  const thisYear = String((now || new Date()).getFullYear());
  const [yearPick, setYearPick] = useState(thisYear);
  const year = YEAR_PARTS.includes(part) ? yearPick : period.start.slice(0, 4);
  const [loaded, setLoaded] = useState<Record<string, any>[] | "loading" | "failed">(givenOrders || "loading");
  useEffect(() => {
    if (givenOrders) { setLoaded(givenOrders); return; }
    let alive = true;
    getOrdersCached().then((o) => { if (alive) setLoaded(o); }).catch(() => { if (alive) setLoaded("failed"); });
    return () => { alive = false; };
  }, [givenOrders]);
  const allRows = useMemo(() => taxCenterModel(sources, "all", now).rows, [sources, now]);
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
  const [categoryName, setCategory] = useState<string | null>(null);
  const openCategory = categoryName ? model.categories.list.find((c) => c.name === categoryName) : undefined;
  const download = () => { const file = ledgerCsvFile(shown, cur, now); downloadCsv(file.text, file.name); };

  return (
    <div className="rp-money">
      {(part === "all" || part === "salestax" || part === "rates" || part === "filings") && <TaxTop part={part === "all" ? "all" : part}
        periods={periods} period={period} onPeriod={(id) => { setPeriodId(id); setPage(1); }} orders={loaded}
        ledgerRows={allRows} states={records.states as Record<string, Record<string, any>>} taxCenter={records.taxCenter as Record<string, any> | null}
        currency={cur} now={nowMs} onTaxCenter={onTaxCenter} />}
      {YEAR_PARTS.includes(part) && <div className="rp-tax-period">
        <span className="rp-tax-period-label">Year</span>
        <Tabs label="Year" idPrefix="tax-year-" value={yearPick} onChange={(y) => { setYearPick(y); setPage(1); }}
          tabs={[thisYear, String(Number(thisYear) - 1)].map((y) => ({ id: y, label: y }))} />
      </div>}
      {(on("money") || on("ledger")) && model.notes.missing > 0 && <p className="rp-money-note" role="status">{model.notes.missing} {model.notes.missing === 1 ? "line has" : "lines have"} no exchange rate yet and {model.notes.missing === 1 ? "is" : "are"} counted at 1 to 1, so these totals may be off. Rates fill in by themselves while you're online.</p>}
      {(on("money") || on("ledger")) && !model.notes.missing && model.notes.estimated > 0 && <p className="rp-money-note" role="status">{model.notes.estimated} foreign-currency {model.notes.estimated === 1 ? "line is" : "lines are"} shown at the last saved exchange rate, not the rate of its own day. Day rates fill in by themselves while you're online.</p>}

      {on("money") && <>
      <SectionCard title={`Money in and out, ${year}`} description="From your stockroom records: every sale, cost and payout." flush>
        <div className="rp-grid-metrics rp-money-pad">
          <MetricCard label="Money in" value={money(s.sales)} footer={deltaText(s.deltas?.sales ?? null, s.prevYear)} />
          <MetricCard label="Money out" value={money(s.expenses)} footer={deltaText(s.deltas?.expenses ?? null, s.prevYear)} />
          <MetricCard label="Net" value={money(s.net)} footer={deltaText(s.deltas?.net ?? null, s.prevYear)} tone={s.net < 0 ? "danger" : undefined} />
          {(hasPublisherTools(sells) || s.artistPayouts !== 0) && <MetricCard label={w("Artist payouts")} value={money(s.artistPayouts)} footer={`Net after: ${money(s.netAfterPayouts)}`} />}
        </div>
      </SectionCard>

      <SectionCard title="Cash flow" description={`Money in and out, month by month in ${year}.`}>
        <CashFlowChart buckets={model.buckets} cur={cur} />
      </SectionCard>

      </>}

      {on("costs") && <>
      {onTaxCenter && <LogExpenseCard taxCenter={records.taxCenter} onSaved={onTaxCenter} prefill={confirming} onPrefillDone={() => setConfirming(null)} />}
      {onTaxCenter && <LogSeveralCard taxCenter={records.taxCenter} onSaved={onTaxCenter} />}
      {onTaxCenter && <PendingExpensesCard taxCenter={records.taxCenter} onSaved={onTaxCenter} onConfirm={setConfirming} />}
      {onTaxCenter && <RecurringSubscriptionsCard taxCenter={records.taxCenter} onSaved={onTaxCenter} now={now} />}
      {onTaxCenter && <SortingRulesCard taxCenter={records.taxCenter} onSaved={onTaxCenter} />}
      </>}

      {on("money") && <>
      <SectionCard title={`By month in ${year}`} flush>
        <DataTable stackOnPhone caption="Money in and out by period" rowKey={(b) => b.key}
          rows={model.buckets}
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
            { key: "c", header: "Category", lead: true, render: (c) => <GhostButton size="sm" onClick={() => setCategory(c.name)}>{c.name}</GhostButton> },
            { key: "n", header: "Entries", numeric: true, render: (c) => c.count },
            { key: "s", header: "Spent", numeric: true, render: (c) => money(c.spent) },
            { key: "d", header: "Deductible", numeric: true, render: (c) => <>{money(c.total)}{c.rate < 1 && <span className="rp-money-sub"> {Math.round(c.rate * 100)}% allowed</span>}</> },
          ]} />
      </SectionCard>

      {openCategory && (
        <Dialog open onClose={() => setCategory(null)} title={openCategory.name}>
          <p className="rp-money-note">{openCategory.count} {openCategory.count === 1 ? "entry" : "entries"}, {money(openCategory.spent)} spent, {money(openCategory.total)} you can deduct.</p>
          <DataTable stackOnPhone caption={`Entries in ${openCategory.name}`} rowKey={(r) => `${r.sourceType}:${r.sourceId || ""}:${r.itemId}:${r.date}:${r.desc}`}
            rows={[...openCategory.items].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))}
            columns={[
              { key: "d", header: "Date", render: (r) => r.date || "-" },
              { key: "e", header: "Description", lead: true, render: (r) => r.desc },
              { key: "b", header: cur, numeric: true, render: (r) => fmt(Number(r.baseAmount || 0), cur) },
            ]} />
        </Dialog>
      )}

      </>}

      {on("costs") && <>
      <TripsCard trips={model.trips as TripRow[]} taxCenter={records.taxCenter as Record<string, any> | null} money={money} baseCurrency={cur} onSaved={onTaxCenter} />

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

      <GapsCard gaps={model.gaps.gaps} hidden={model.gaps.hidden} books={sources.books} states={sources.states}
        taxCenter={records.taxCenter as Record<string, any> | null} today={new Date(nowMs).toLocaleDateString("en-CA")} money={money} onSaved={onTaxCenter} />

      </>}

      {on("ledger") && <SectionCard title="Ledger" actions={<SecondaryButton onClick={download} disabled={!shown.length}>Download spreadsheet</SecondaryButton>} flush>
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
              ? <LedgerLineActions line={r} taxCenter={records.taxCenter as Record<string, unknown> | null} onSaved={onTaxCenter} onNote={setLedgerNote} />
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
      </SectionCard>}

      {on("yearend") && <>
      <StockValueCard books={records.books as Record<string, any>[]} states={records.states as Record<string, Record<string, any>>} taxCenter={records.taxCenter as Record<string, any> | null}
        fxRateCache={sources.fxRateCache} onTaxCenter={onTaxCenter} onState={onState} />
      {Array.isArray(loaded) && <CardFeesCard orders={loaded} year={year} taxCenter={records.taxCenter as Record<string, any> | null} onSaved={onTaxCenter} />}
      <YearReportCard input={{ books: records.books as Record<string, any>[], states: records.states as Record<string, Record<string, any>>, taxCenter: records.taxCenter as Record<string, any> | null, fxRateCache: sources.fxRateCache }} year={year} money={money} />
      <TaxSeasonCard input={{ books: records.books as Record<string, any>[], states: records.states as Record<string, Record<string, any>>, taxCenter: records.taxCenter as Record<string, any> | null, fxRateCache: sources.fxRateCache }}
        year={year} onSaved={onTaxCenter} />
      </>}
      {on("costs") && <ReceiptsVaultCard rows={model.rows} money={money} onSaved={onTaxCenter} taxCenter={records.taxCenter as Record<string, unknown> | null} />}
    </div>
  );
}

type PageProps = { load?: () => Promise<StockroomRecords>; onOpen?: unknown; isPage?: unknown };
const taxPage = (part: TaxPart) => function TaxPartPage({ load = stockroomApi.load }: PageProps) {
  return <RecordsGate load={load} what="the Tax centre">{(records) => <TaxCenterLive initial={records} part={part} />}</RecordsGate>;
};
/** Tax centre › Money in and out (the lead page), and its seven other pages (v4). */
export const TaxCenterPage = taxPage("money");
export const TaxLedgerPage = taxPage("ledger");
export const TaxCostsPage = taxPage("costs");
export const TaxSalesPage = taxPage("salestax");
export const TaxRatesPage = taxPage("rates");
export const TaxFilingsPage = taxPage("filings");
export const TaxYearPage = taxPage("yearend");

/** Keeps the records on screen and swaps in the Tax centre as the save returned it (other devices' rows included). */
function TaxCenterLive({ initial, part }: { initial: StockroomRecords; part: TaxPart }) {
  const [records, setRecords] = useRatedRecords(initial);
  return <TaxCenterView part={part} records={records} onTaxCenter={(taxCenter) => setRecords((r) => ({ ...r, taxCenter }))}
    onState={(id, state) => setRecords((r) => ({ ...r, states: { ...r.states, [id]: state } }))} />;
}
