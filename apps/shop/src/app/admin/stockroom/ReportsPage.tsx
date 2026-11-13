// Bookkeeping › Reports (13 November 2026, Julian): the balance sheet for any date, the cash flow forecast for the next 90
// days and the year-end tax pack (one zip for the accountant). Figures: moneyStatements.ts (pure). Opening the page also
// refreshes the bookkeeper's copy of these reports (bookkeeperReports.ts), because the bookkeeper can't read the records.
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@stockroom/money.js";
import { downloadCsv } from "@stockroom/download.js";

import { DataTable, EmptyState, PageActions, PrimaryButton, SecondaryButton, SectionCard, TextField } from "../riso/components";
import { shopProfile } from "../../../lib/shopProfile";
import { DEFAULT_SHOP_NAME } from "../../../shared/shopIdentity";
import { getOrdersCached } from "../ordersCache";
import { saveFile, zipStored } from "../xlsxWriter";
import { RecordsGate } from "./RecordsGate";
import { useRatedRecords } from "./taxRates";
import { moneyYears, useMoneyYear, YearSwitch } from "./YearSwitch";
import { ledgerCsvFile, sourcesOf, taxCenterModel } from "./moneyReports";
import { yearReportCsv } from "./yearReport";
import { taxSeasonExport } from "./taxSeason";
import { balanceSheet, balanceSheetCsv, balanceSheetPage, cashForecast, dayKey, forecastCsv, taxPackFiles, type Forecast, type StatementInput } from "./moneyStatements";
import { saveBookkeeperReports } from "./bookkeeperReports";
import type { NativePageProps } from "./nativePages";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./money.css";
import "./taxTop.css";

type Row = Record<string, any>;
const pressName = () => shopProfile.name || DEFAULT_SHOP_NAME;

/** Opens the print dialog for a whole document page (the hidden-frame way the line sheet prints). */
function printPage(html: string, title: string) {
  const frame = document.createElement("iframe");
  frame.title = title; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

/** Cash at the end of each week, as bars; below zero is drawn under the line. The list under it says the same in words. */
export function ForecastChart({ forecast, money }: { forecast: Forecast; money: (n: number) => string }) {
  const values = forecast.weeks.map((w) => w.balance);
  const top = Math.max(1, ...values, forecast.startCash);
  const bottom = Math.min(0, ...values);
  const W = 640, H = 180, pad = 22, slot = (W - pad) / Math.max(1, values.length), bar = Math.max(4, Math.min(28, slot - 8));
  const y = (v: number) => 8 + ((top - v) / (top - bottom || 1)) * (H - pad - 8);
  return (
    <div>
      <p className="rp-money-legend"><span><i className="rp-in" style={{ background: "var(--rp-success)" }} />Cash at the end of the week</span><span><i style={{ background: "var(--rp-danger)" }} />Below zero</span></p>
      <svg className="rp-money-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cash at the end of each week for the next 90 days">
        <line x1={pad} x2={W} y1={y(0)} y2={y(0)} />
        {forecast.weeks.map((w, i) => {
          const x = pad + i * slot + (slot - bar) / 2;
          const v = w.balance;
          return (
            <g key={w.start}>
              <rect className={v < 0 ? "rp-out" : "rp-in"} x={x} y={Math.min(y(v), y(0))} width={bar} height={Math.max(1, Math.abs(y(v) - y(0)))}><title>{`Week of ${w.start}: ${money(v)}`}</title></rect>
              {i % 2 === 0 && <text x={x + bar / 2} y={H - 6} textAnchor="middle">{w.start.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The balance sheet as the two-part table the P&L uses. Shared with the bookkeeper's desk. */
export function SheetTable({ sheet, money }: { sheet: ReturnType<typeof balanceSheet>; money: (n: number) => string }) {
  return (
    <table className="rp-bk-pl">
      <tbody>
        <tr data-head=""><td colSpan={2} style={{ textAlign: "left" }}><strong>What you own</strong></td></tr>
        {sheet.assets.map((l) => <tr key={l.id}><td>{l.label}{l.note && <span className="rp-money-sub"> {l.note}</span>}</td><td>{money(l.amount)}</td></tr>)}
        <tr data-total=""><td>Total owned</td><td>{money(sheet.totalAssets)}</td></tr>
        <tr data-head=""><td colSpan={2} style={{ textAlign: "left" }}><strong>What you owe</strong></td></tr>
        {sheet.liabilities.map((l) => <tr key={l.id}><td>{l.label}{l.note && <span className="rp-money-sub"> {l.note}</span>}</td><td>{money(l.amount)}</td></tr>)}
        <tr data-total=""><td>Total owed</td><td>{money(sheet.totalLiabilities)}</td></tr>
        <tr data-total=""><td>Your share of the business</td><td>{money(sheet.equity)}</td></tr>
      </tbody>
    </table>
  );
}

const SOURCE_WORDS: Record<string, string> = { invoice: "Invoice", repeat: "Repeating invoice", bill: "Bill", recurring: "Recurring", pending: "Expected cost", tax: "Sales tax", sales: "Usual sales" };

export function ReportsView({ records, orders, now }: { records: StockroomRecords; orders: Row[] | "loading" | "failed"; now?: Date }) {
  const today = dayKey(now || new Date());
  const sources = useMemo(() => sourcesOf(records), [records]);
  const ready = Array.isArray(orders);
  const input: StatementInput = useMemo(() => ({ records, sources, orders: ready ? (orders as Row[]) : null, today }), [records, sources, orders, ready, today]);
  const allRows = useMemo(() => taxCenterModel(sources, "all", now).rows, [sources, now]);
  const years = useMemo(() => moneyYears(allRows.map((r: Row) => r.date), now), [allRows, now]);
  const [year, setYear] = useMoneyYear(years);
  const [asOf, setAsOf] = useState(today);
  const sheet = useMemo(() => balanceSheet(input, asOf || today), [input, asOf, today]);
  const forecast = useMemo(() => cashForecast(input), [input]);
  const cur = sheet.currency;
  const money = (n: number) => fmt(n, cur);
  const [packNote, setPackNote] = useState<{ tone: "ok" | "warn" | "error" | "busy"; text: string } | null>(null);

  // The bookkeeper's copy, once the orders are in (sales tax needs them). Best effort: a failure leaves the last copy.
  useEffect(() => { if (ready) void saveBookkeeperReports(input, pressName()); }, [ready, input]);

  const stem = pressName().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Shop";
  const items = forecast.items.filter((it) => it.source !== "sales");

  async function downloadPack() {
    setPackNote({ tone: "busy", text: "Putting your tax pack together…" });
    try {
      const taxInput = { books: records.books as Row[], states: sources.states, taxCenter: sources.taxCenter, fxRateCache: sources.fxRateCache };
      const yearModel = taxCenterModel(sources, year, now);
      const { files, receipts } = taxPackFiles({
        ...input, pressName: pressName(), year,
        yearReport: yearReportCsv(taxInput, year), taxSeason: taxSeasonExport(taxInput, year, { pressName: pressName(), today }),
        ledger: ledgerCsvFile(yearModel.rows, cur, now),
      });
      const enc = new TextEncoder();
      const out: [string, Uint8Array][] = files.map((f) => [f.path, enc.encode(f.text)]);
      let missed = 0;
      for (let i = 0; i < receipts.length; i++) {
        setPackNote({ tone: "busy", text: `Adding receipts: ${i + 1} of ${receipts.length}…` });
        try {
          const res = await fetch(receipts[i].url);
          if (!res.ok) throw new Error(String(res.status));
          out.push([receipts[i].path, new Uint8Array(await res.arrayBuffer())]);
        } catch { missed += 1; }
      }
      if (missed) out.push(["09 Receipts that didn't download.txt", enc.encode(`${missed} receipt ${missed === 1 ? "file" : "files"} couldn't be read while this pack was made. Download the pack again, or open them from Bookkeeping > Receipts.`)]);
      saveFile(`${stem}_Tax_pack_${year}.zip`, zipStored(out), "application/zip");
      const parts = [`${files.length} files and ${receipts.length - missed} ${receipts.length - missed === 1 ? "receipt" : "receipts"}.`];
      if (missed) parts.push(`${missed} ${missed === 1 ? "receipt" : "receipts"} didn't download; the pack says which.`);
      if (!ready) parts.push("Website orders didn't load, so the sales tax file is empty.");
      setPackNote({ tone: missed || !ready ? "warn" : "ok", text: `Downloaded: ${parts.join(" ")}` });
    } catch (error) {
      console.error("Tax pack failed", error);
      setPackNote({ tone: "error", text: "The tax pack couldn't be made. Nothing was downloaded. Try again." });
    }
  }

  const low = forecast.lowest;
  return (
    <div className="rp-money">
      <PageActions>
        <YearSwitch years={years} year={year} onYear={setYear} />
        <PrimaryButton onClick={() => void downloadPack()} disabled={packNote?.tone === "busy"}>Download tax pack</PrimaryButton>
      </PageActions>
      <div className="rp-bk-tiles">
        <div className="rp-tax-tile" data-tone="sky"><p className="rp-tax-tile-label">Cash today</p><p className="rp-tax-tile-value">{money(forecast.startCash)}</p><p className="rp-tax-tile-foot">From your records</p></div>
        <div className="rp-tax-tile"><p className="rp-tax-tile-label">You own</p><p className="rp-tax-tile-value">{money(sheet.totalAssets)}</p><p className="rp-tax-tile-foot">You owe {money(sheet.totalLiabilities)}</p></div>
        <div className="rp-tax-tile" data-tone="apricot"><p className="rp-tax-tile-label">In 90 days</p><p className="rp-tax-tile-value">{money(forecast.endCash)}</p>
          <p className="rp-tax-tile-foot">{low.balance < 0 ? `Below zero the week of ${low.week}` : `Lowest ${money(low.balance)}`}</p></div>
      </div>

      <SectionCard title="Balance sheet" description="What the business owns and owes on the day you pick."
        actions={<>
          <SecondaryButton size="sm" onClick={() => downloadCsv(balanceSheetCsv(sheet, pressName()), `${stem}_Balance_sheet_${sheet.asOf}.csv`)}>Spreadsheet</SecondaryButton>
          <SecondaryButton size="sm" onClick={() => printPage(balanceSheetPage(sheet, pressName(), money), "Balance sheet")}>Print or save PDF</SecondaryButton>
        </>}>
        <div className="rp-filter-bar"><TextField label="As of" type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value || today)} /></div>
        <SheetTable sheet={sheet} money={money} />
        {sheet.notes.map((n) => <p key={n} className="rp-money-note" role="status">{n}</p>)}
      </SectionCard>

      <SectionCard title="Cash flow, next 90 days" description="Today's cash, plus what's coming in, less what's going out."
        actions={<SecondaryButton size="sm" onClick={() => downloadCsv(forecastCsv(forecast, pressName()), `${stem}_Cash_forecast_${forecast.start}.csv`)}>Spreadsheet</SecondaryButton>}>
        <ForecastChart forecast={forecast} money={money} />
        <p className="rp-money-foot">Usual sales: about <strong>{money(forecast.weeklySales)}</strong> a week, from the last 90 days.</p>
        {forecast.notes.map((n) => <p key={n} className="rp-money-note" role="status">{n}</p>)}
      </SectionCard>
      <SectionCard title="Coming up" flush>
        <DataTable stackOnPhone caption="Money coming in and going out in the next 90 days" rowKey={(it) => `${it.date}:${it.source}:${it.label}:${it.amount}`} rows={items}
          empty={<EmptyState inline title="Nothing dated in the next 90 days" description="Unpaid invoices, recurring costs and expected costs show here." />}
          columns={[
            { key: "d", header: "Date", render: (it) => <>{it.date}{it.late && <span className="rp-money-sub"> late</span>}</> },
            { key: "w", header: "What", lead: true, render: (it) => it.label },
            { key: "s", header: "Kind", render: (it) => SOURCE_WORDS[it.source] },
            { key: "a", header: cur, numeric: true, render: (it) => <span className={it.kind === "in" ? "rp-money-in" : "rp-money-out"}>{it.kind === "in" ? "+" : "-"}{money(it.amount)}</span> },
          ]} />
      </SectionCard>

      <SectionCard title={`Tax pack for ${year}`} description="One zip for tax time: reports, ledger, sales tax and every receipt.">
        <ul className="rp-bk-reports">
          <li><strong>Reports</strong><span>Profit and loss, balance sheet, expenses by category and the year report.</span></li>
          <li><strong>Ledger and sales tax</strong><span>Every sale and cost, and sales tax by quarter.</span></li>
          <li><strong>Receipts</strong><span>Each file named by date, expense and amount, with a list.</span></li>
        </ul>
        {packNote && <p className="rp-sr-save" data-tone={packNote.tone} role={packNote.tone === "error" ? "alert" : "status"}>{packNote.text}</p>}
      </SectionCard>
    </div>
  );
}

function ReportsLive({ initial }: { initial: StockroomRecords }) {
  const [records] = useRatedRecords(initial);
  const [orders, setOrders] = useState<Row[] | "loading" | "failed">("loading");
  useEffect(() => {
    let alive = true;
    getOrdersCached().then((o) => { if (alive) setOrders(o); }).catch(() => { if (alive) setOrders("failed"); });
    return () => { alive = false; };
  }, []);
  return <ReportsView records={records} orders={orders} />;
}

export function ReportsPage({ load = stockroomApi.load }: { load?: () => Promise<StockroomRecords> } & Partial<NativePageProps>) {
  return <RecordsGate load={load} what="your reports">{(records) => <ReportsLive initial={records} />}</RecordsGate>;
}
