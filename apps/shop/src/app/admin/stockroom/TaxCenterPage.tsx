// Stockroom › Tax centre and Bookkeeping (mockup "Tax Centre + Bookkeeping", 12 November 2026), drawn by the admin itself.
// Tax centre is one page: sales tax for a period from the shop's orders (TaxTop.tsx), filings and the tax-season file.
// Bookkeeping has five tabs: Overview (figures, profit and loss, where the money goes, cash flow, reports), Transactions
// (payouts matched to sales, the ledger), Expenses (costs that may be missing, logging, pending, recurring, rules, trips),
// Receipts and Artist payouts (book shops). Both share one year (YearSwitch.tsx). Figures come from the stockroom's own
// rules (moneyReports.ts); the cards that save write the Tax centre record as before.
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";
import { downloadCsv } from "@stockroom/download.js";
import type { Delta } from "@stockroom/tax-ledger.js";

import { DataTable, Dialog, EmptyState, GhostButton, MetricCard, PageActions, PageHead, Pagination, PrimaryButton, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, Tabs } from "../riso/components";
import { useShopSells, useShopWords } from "../shopWords";
import { hasPublisherTools } from "../../../shared/shopSells";
import { getOrdersCached } from "../ordersCache";
import { TaxTop } from "./TaxTop";
import { taxPeriods, yearPeriods } from "./taxPeriods";
import { moneyYears, useMoneyYear, YearSwitch } from "./YearSwitch";
import { ReceiptsGrid } from "./ReceiptsGrid";
import { ArtistPayouts } from "./ArtistPayouts";
import { ReconcileView } from "./ReconcilePage";
import { yearFigures, yearReportCsv } from "./yearReport";
import type { NativePageProps } from "./nativePages";
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

/**
 * The money pages (mockup, 12 November 2026): "tax" is the Tax centre, one page; "overview", "transactions",
 * "expenses", "receipts" and "artists" are Bookkeeping's tabs (riso/nav.ts). The older v4 parts stay for "all", which
 * draws everything on one page (the tests).
 */
export type TaxPart = "all" | "money" | "ledger" | "costs" | "salestax" | "rates" | "filings" | "yearend"
  | "tax" | "overview" | "transactions" | "expenses" | "receipts" | "artists";
const BOOK_PARTS: TaxPart[] = ["overview", "transactions", "expenses", "receipts", "artists"];
const YEAR_PARTS: TaxPart[] = ["money", "ledger", "yearend"];

export function TaxCenterView({ records, now, onTaxCenter, onState, orders: givenOrders, part = "all", onOpen }: {
  records: StockroomRecords; part?: TaxPart; now?: Date; onOpen?: NativePageProps["onOpen"]; onTaxCenter?: (taxCenter: Record<string, unknown>) => void; onState?: (bookId: string, state: Record<string, unknown>) => void;
  /** The shop's orders (tests and the fixture pass them; otherwise read through the shared copy). */
  orders?: Record<string, any>[];
}) {
  const w = useShopWords();
  const sells = useShopSells();
  const sources = useMemo(() => sourcesOf(records), [records]);
  const nowMs = (now || new Date()).getTime();
  const periods = useMemo(() => taxPeriods(nowMs), [nowMs]);
  const [periodId, setPeriodId] = useState(periods[0].id);
  // The cards below follow the period's year; the pages without period pills pick a year of their own.
  const on = (p: TaxPart) => part === "all" || part === p;
  const thisYear = String((now || new Date()).getFullYear());
  const [yearPick, setYearPick] = useState(thisYear);
  // The Tax centre and Bookkeeping share one year, picked in the header (YearSwitch.tsx).
  const allRows = useMemo(() => taxCenterModel(sources, "all", now).rows, [sources, now]);
  const years = useMemo(() => moneyYears(allRows.map((r) => r.date), now), [allRows, now]);
  const [moneyYear, setMoneyYear] = useMoneyYear(years);
  const onePage = part === "tax" || BOOK_PARTS.includes(part);
  const taxPeriodsShown = useMemo(() => (part === "tax" ? yearPeriods(moneyYear, nowMs) : periods), [part, moneyYear, nowMs, periods]);
  const period = taxPeriodsShown.find((p) => p.id === periodId) || taxPeriodsShown[0];
  const year = onePage ? moneyYear : YEAR_PARTS.includes(part) ? yearPick : period.start.slice(0, 4);
  const [loaded, setLoaded] = useState<Record<string, any>[] | "loading" | "failed">(givenOrders || "loading");
  useEffect(() => {
    if (givenOrders) { setLoaded(givenOrders); return; }
    let alive = true;
    getOrdersCached().then((o) => { if (alive) setLoaded(o); }).catch(() => { if (alive) setLoaded("failed"); });
    return () => { alive = false; };
  }, [givenOrders]);
  const [filter, setFilter] = useState<LedgerFilter>({ type: "all", query: "" });
  const [ledgerNote, setLedgerNote] = useState<SaveNote | null>(null);
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<Prefill | null>(null);
  // v4 Costs to log: "Log an expense" in the header opens the New expense page (so does Confirm on a waiting cost).
  const [adding, setAdding] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const ownPage = (part === "costs" || BOOK_PARTS.includes(part)) && !!onTaxCenter;
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

  if (ownPage && (adding || confirming)) {
    const done = () => { setAdding(false); setConfirming(null); setPhotoFile(null); };
    return (
      <div className="rp-money">
        <PageHead title="Log an expense" description="Money that went out of the business" back={{ label: part === "costs" ? "Costs to log" : "Bookkeeping", onClick: done }} />
        <LogExpenseCard page taxCenter={records.taxCenter} prefill={confirming} onCancel={done} photoFile={photoFile}
          onSaved={(taxCenter) => { onTaxCenter!(taxCenter); done(); }} />
      </div>
    );
  }

  const categoryDialog = openCategory ? (
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
  ) : null;
  const switcher = <YearSwitch years={years} year={moneyYear} onYear={(y) => { setMoneyYear(y); setPage(1); }} />;
  const taxInput = { books: records.books as Record<string, any>[], states: records.states as Record<string, Record<string, any>>, taxCenter: records.taxCenter as Record<string, any> | null, fxRateCache: sources.fxRateCache };
  const rateNote = model.notes.missing > 0
    ? <p className="rp-money-note" role="status">{model.notes.missing} {model.notes.missing === 1 ? "line has" : "lines have"} no exchange rate yet and {model.notes.missing === 1 ? "is" : "are"} counted at 1 to 1, so these totals may be off. Rates fill in by themselves while you're online.</p>
    : null;

  if (part === "tax") {
    return (
      <div className="rp-money">
        <TaxTop part="page" lead={switcher} periods={taxPeriodsShown} period={period} onPeriod={(id) => setPeriodId(id)} orders={loaded}
          ledgerRows={allRows} states={records.states as Record<string, Record<string, any>>} taxCenter={records.taxCenter as Record<string, any> | null}
          currency={cur} now={nowMs} onTaxCenter={onTaxCenter} />
        <TaxSeasonCard input={taxInput} year={year} onSaved={onTaxCenter} />
      </div>
    );
  }

  if (BOOK_PARTS.includes(part)) {
    const exportAll = () => { const file = ledgerCsvFile(model.rows, cur, now); downloadCsv(file.text, file.name); };
    const ledgerCard = (
      <LedgerCard rows={slice} shown={shown} filter={filter} onFilter={(f) => { setFilter(f); setPage(1); }} onDownload={download}
        note={ledgerNote} onNote={setLedgerNote} taxCenter={records.taxCenter} onTaxCenter={onTaxCenter} cur={cur} money={money}
        totals={totals} page={at} pageCount={pageCount} onPage={setPage} />
    );
    return (
      <div className="rp-money">
        <PageActions>
          {switcher}
          {onTaxCenter && <SecondaryButton onClick={() => setAdding(true)}>Log expense</SecondaryButton>}
          <PrimaryButton onClick={exportAll} disabled={!model.rows.length}>Export for accountant</PrimaryButton>
        </PageActions>
        {part === "overview" && <>
          {rateNote}
          <BookOverview model={model} year={year} money={money} figures={yearFigures(taxInput, year)} publisher={hasPublisherTools(sells) || s.artistPayouts !== 0}
            onCategory={setCategory} w={w} />
          <SectionCard title="Cash flow summary">
            <dl className="rp-bk-stats">
              <div><dt>Money in</dt><dd>{money(s.sales)}</dd></div>
              <div><dt>Money out</dt><dd>{money(s.expenses)}</dd></div>
              <div><dt>Transactions</dt><dd>{model.rows.length}</dd></div>
              <div><dt>Average sale</dt><dd>{(() => { const n = model.rows.filter((r) => r.isIncome && !r.voided).length; return n ? money(s.sales / n) : "-"; })()}</dd></div>
              {(hasPublisherTools(sells) || s.artistPayouts !== 0) && <div><dt>{w("Artist payouts")}</dt><dd>{money(s.artistPayouts)}</dd></div>}
              {(hasPublisherTools(sells) || s.artistPayouts !== 0) && <div><dt>Net after payouts</dt><dd>{money(s.netAfterPayouts)}</dd></div>}
            </dl>
            <CashFlowChart buckets={model.buckets} cur={cur} />
          </SectionCard>
          <SectionCard title="Reports and exports">
            <ul className="rp-bk-reports">
              <li><strong>Profit and loss</strong><span>Sales, cost of goods, expenses and profit for {year}.</span>
                <SecondaryButton size="sm" onClick={() => { const f = yearReportCsv(taxInput, year); downloadCsv(f.text, f.name); }}>Spreadsheet</SecondaryButton></li>
              <li><strong>General ledger</strong><span>Every sale and cost in {year}.</span>
                <SecondaryButton size="sm" onClick={exportAll} disabled={!model.rows.length}>Spreadsheet</SecondaryButton></li>
              <li><strong>Expense by category</strong><span>Spent and deductible, by category.</span>
                <SecondaryButton size="sm" disabled={!model.categories.list.length} onClick={() => downloadCsv(categoriesCsv(model.categories.list), `Expenses_by_category_${year}.csv`)}>Spreadsheet</SecondaryButton></li>
            </ul>
          </SectionCard>
          <StockValueCard books={records.books as Record<string, any>[]} states={records.states as Record<string, Record<string, any>>} taxCenter={records.taxCenter as Record<string, any> | null}
            fxRateCache={sources.fxRateCache} onTaxCenter={onTaxCenter} onState={onState} />
          {Array.isArray(loaded) && <CardFeesCard orders={loaded} year={year} taxCenter={records.taxCenter as Record<string, any> | null} onSaved={onTaxCenter} />}
        </>}
        {part === "transactions" && <>
          {Array.isArray(loaded) ? <ReconcileView orders={loaded} /> : <p className="rp-money-note" role="status">{loaded === "loading" ? "Reading your payouts…" : "Couldn't read your payouts."}</p>}
          {rateNote}
          {ledgerCard}
        </>}
        {part === "expenses" && <>
          <GapsCard gaps={model.gaps.gaps} hidden={model.gaps.hidden} books={sources.books} states={sources.states}
            taxCenter={records.taxCenter as Record<string, any> | null} today={new Date(nowMs).toLocaleDateString("en-CA")} money={money} onSaved={onTaxCenter} />
          {onTaxCenter && <LogExpenseCard taxCenter={records.taxCenter} onSaved={onTaxCenter} prefill={confirming} onPrefillDone={() => setConfirming(null)} />}
          {onTaxCenter && <LogSeveralCard taxCenter={records.taxCenter} onSaved={onTaxCenter} />}
          {onTaxCenter && <PendingExpensesCard taxCenter={records.taxCenter} onSaved={onTaxCenter} onConfirm={setConfirming} />}
          {onTaxCenter && <RecurringSubscriptionsCard taxCenter={records.taxCenter} onSaved={onTaxCenter} now={now} />}
          {onTaxCenter && <SortingRulesCard taxCenter={records.taxCenter} onSaved={onTaxCenter} />}
          <TripsCard trips={model.trips as TripRow[]} taxCenter={records.taxCenter as Record<string, any> | null} money={money} baseCurrency={cur} onSaved={onTaxCenter} />
        </>}
        {part === "receipts" && <ReceiptsGrid records={records} year={year} onSaved={onTaxCenter}
          onPhoto={onTaxCenter ? (file) => { setPhotoFile(file); setAdding(true); } : undefined} />}
        {part === "artists" && <ArtistPayouts records={records} onOpenBook={onOpen ? (bookId) => onOpen("dashboard", { bookId }) : undefined} />}
        {categoryDialog}
      </div>
    );
  }

  return (
    <div className="rp-money">
      {ownPage && <PageActions><PrimaryButton onClick={() => setAdding(true)}>Log an expense</PrimaryButton></PageActions>}
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
      {onTaxCenter && !ownPage && <LogExpenseCard taxCenter={records.taxCenter} onSaved={onTaxCenter} prefill={confirming} onPrefillDone={() => setConfirming(null)} />}
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

      {categoryDialog}

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

      {on("ledger") && <LedgerCard rows={slice} shown={shown} filter={filter} onFilter={(f) => { setFilter(f); setPage(1); }} onDownload={download}
        note={ledgerNote} onNote={setLedgerNote} taxCenter={records.taxCenter} onTaxCenter={onTaxCenter} cur={cur} money={money}
        totals={totals} page={at} pageCount={pageCount} onPage={setPage} />}

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

type Category = { name: string; total: number; spent: number; rate: number; count: number };
/** Expense by category as a spreadsheet (Reports and exports). */
function categoriesCsv(list: Category[]): string {
  const cell = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return [["Category", "Entries", "Spent", "Deductible", "Share allowed"], ...list.map((c) => [c.name, String(c.count), c.spent.toFixed(2), c.total.toFixed(2), `${Math.round(c.rate * 100)}%`])]
    .map((r) => r.map(cell).join(",")).join("\n");
}

/** Bookkeeping › Overview's top: four figures, the profit and loss for the year and where the money goes. */
function BookOverview({ model, year, money, figures: f, publisher, onCategory, w }: {
  model: ReturnType<typeof taxCenterModel>; year: string; money: (n: number) => string; figures: ReturnType<typeof yearFigures>;
  publisher: boolean; onCategory: (name: string) => void; w: (s: string) => string;
}) {
  const s = model.summary;
  const list = [...model.categories.list].sort((a, b) => b.spent - a.spent).slice(0, 8);
  const most = Math.max(1, ...list.map((c) => c.spent));
  const tile = (label: string, value: number, foot: string | null, tone?: string) => (
    <div className="rp-tax-tile" data-tone={tone}>
      <p className="rp-tax-tile-label">{label}</p>
      <p className="rp-tax-tile-value">{money(value)}</p>
      {foot && <p className="rp-tax-tile-foot">{foot}</p>}
    </div>
  );
  return (
    <>
      <div className="rp-bk-tiles">
        {/* The same figures as the profit and loss below, so the page never shows two answers. */}
        {tile("Revenue", f.revenue, null, "sky")}
        {tile("Expenses", f.opex, f.missingReceiptsCount ? `${f.missingReceiptsCount} without a receipt` : null)}
        {tile("Net profit", f.profit, f.revenue ? `${Math.round((f.profit / f.revenue) * 100)}% of sales` : null)}
        {publisher ? tile(w("Paid to artists"), s.artistPayouts, `Net after: ${money(s.netAfterPayouts)}`, "apricot") : tile("Gross profit", f.revenue - f.cogs, "Sales less the cost of what sold", "apricot")}
      </div>
      <div className="rp-bk-grid">
        <SectionCard title={`Profit and loss · ${year}`}>
          <table className="rp-bk-pl">
            <tbody>
              <tr><td>Sales</td><td>{money(f.revenue)}</td></tr>
              <tr><td>{publisher ? "Cost of copies sold" : "Cost of goods sold"}</td><td>-{money(f.cogs)}</td></tr>
              <tr data-total=""><td>Gross profit</td><td>{money(f.revenue - f.cogs)}</td></tr>
              <tr><td>Expenses</td><td>-{money(f.opex)}</td></tr>
              {(publisher || f.shares !== 0) && <tr><td>{w("Artist shares")}</td><td>-{money(f.shares)}</td></tr>}
              <tr data-total=""><td>Net profit</td><td>{money(f.profit)}</td></tr>
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="Where the money goes">
          {list.length ? (
            <ul className="rp-bk-bars">
              {list.map((c) => (
                <li key={c.name}>
                  <button type="button" onClick={() => onCategory(c.name)}><span>{c.name}</span><strong>{money(c.spent)}</strong></button>
                  <div className="rp-tax-bar" aria-hidden="true"><span style={{ width: `${Math.round((c.spent / most) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState inline title={`No expenses in ${year}`} />}
        </SectionCard>
      </div>
    </>
  );
}

/** The ledger: search, money in or out, every line with its category, and the spreadsheet download. */
function LedgerCard({ rows, shown, filter, onFilter, onDownload, note, onNote, taxCenter, onTaxCenter, cur, money, totals, page, pageCount, onPage }: {
  rows: Record<string, any>[]; shown: Record<string, any>[]; filter: LedgerFilter; onFilter: (f: LedgerFilter) => void; onDownload: () => void;
  note: SaveNote | null; onNote: (n: SaveNote) => void; taxCenter: unknown; onTaxCenter?: (taxCenter: Record<string, unknown>) => void;
  cur: string; money: (n: number) => string; totals: { income: number; expense: number; net: number }; page: number; pageCount: number; onPage: (n: number) => void;
}) {
  return (
    <SectionCard title="Ledger" actions={<SecondaryButton onClick={onDownload} disabled={!shown.length}>Download spreadsheet</SecondaryButton>} flush>
        <div className="rp-money-pad">
          <div className="rp-filter-bar">
            <div className="rp-grow"><SearchField label="Search the ledger" value={filter.query} onChange={(e) => { onFilter({ ...filter, query: e.target.value }); }} /></div>
            <SelectField label="Show" value={filter.type} onChange={(e) => { onFilter({ ...filter, type: e.target.value as LedgerFilter["type"] }); }}>
              <option value="all">Everything</option><option value="sales">Money in</option><option value="expenses">Money out</option>
            </SelectField>
          </div>
        </div>
        {note && <div className="rp-money-pad"><p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p></div>}
        <DataTable stackOnPhone caption="Ledger" rowKey={(r) => `${r.sourceType}:${r.sourceId || ""}:${r.itemId}:${r.date}:${r.desc}`} rows={rows}
          empty={<EmptyState inline title="No entries match" />}
          columns={[
            { key: "d", header: "Date", render: (r) => r.date || "-" },
            { key: "t", header: "Type", render: (r) => <>{r.type}{r.voided && <StatusBadge glyph={false}>Voided</StatusBadge>}</> },
            { key: "e", header: "Description", lead: true, render: (r) => r.desc },
            { key: "c", header: "Category", render: (r) => (onTaxCenter && isEditableLine(r)
              ? <LedgerLineActions line={r} taxCenter={taxCenter as Record<string, unknown> | null} onSaved={onTaxCenter} onNote={onNote} />
              : r.cat || "") },
            { key: "o", header: "Original", numeric: true, render: (r) => `${fmt(Number(r.origAmount || 0), r.origCurrency || cur)}` },
            { key: "b", header: cur, numeric: true, render: (r) => <span className={r.isIncome ? "rp-money-in" : "rp-money-out"}>{r.isIncome ? "+" : "-"}{fmt(Number(r.baseAmount || 0), cur)}</span> },
          ]} />
        {shown.length > 0 && (
          <div className="rp-money-pad">
            <p className="rp-money-foot">{shown.length} {shown.length === 1 ? "entry" : "entries"}: in <strong>{money(totals.income)}</strong>, out <strong>{money(totals.expense)}</strong>, net <strong>{money(totals.net)}</strong></p>
            {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPage={onPage} />}
          </div>
        )}
      </SectionCard>
  );
}

type PageProps = { load?: () => Promise<StockroomRecords>; onOpen?: NativePageProps["onOpen"]; isPage?: unknown };
const taxPage = (part: TaxPart) => function TaxPartPage({ load = stockroomApi.load, onOpen }: PageProps) {
  return <RecordsGate load={load} what={part === "tax" ? "the Tax centre" : "your bookkeeping"}>{(records) => <TaxCenterLive initial={records} part={part} onOpen={onOpen} />}</RecordsGate>;
};
/** Tax centre (one page) and Bookkeeping's five tabs (mockup, 12 November 2026). */
export const TaxCenterPage = taxPage("tax");
export const BookOverviewPage = taxPage("overview");
export const TransactionsPage = taxPage("transactions");
export const ExpensesPage = taxPage("expenses");
export const ReceiptsPage = taxPage("receipts");
export const ArtistPayoutsPage = taxPage("artists");

/** Keeps the records on screen and swaps in the Tax centre as the save returned it (other devices' rows included). */
function TaxCenterLive({ initial, part, onOpen }: { initial: StockroomRecords; part: TaxPart; onOpen?: NativePageProps["onOpen"] }) {
  const [records, setRecords] = useRatedRecords(initial);
  return <TaxCenterView part={part} records={records} onOpen={onOpen} onTaxCenter={(taxCenter) => setRecords((r) => ({ ...r, taxCenter }))}
    onState={(id, state) => setRecords((r) => ({ ...r, states: { ...r.states, [id]: state } }))} />;
}
