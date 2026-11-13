// The bookkeeper's desk › Reports (13 November 2026): the balance sheet, the cash flow forecast and the profit and loss
// from the owner's last visit to Bookkeeping › Reports (bookkeeperReports.ts), with the same downloads. Read only.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { fmt } from "@stockroom/money.js";
import { toCsv } from "@stockroom/csv.js";
import { downloadCsv } from "@stockroom/download.js";

import { DataTable, EmptyState, LoadingState, SecondaryButton, SectionCard } from "../riso/components";
import { zipStored, saveFile } from "../xlsxWriter";
import { balanceSheetCsv, balanceSheetPage, forecastCsv } from "./moneyStatements";
import { BOOKKEEPER_REPORTS_KEY, profitAndLossRows, readBookkeeperReports, type BookkeeperReports } from "./bookkeeperReports";
import { loadBookkeeperSetting } from "./stockroomData";
import { ForecastChart, SheetTable } from "./ReportsPage";
import "./money.css";

const csv = (rows: unknown[][]) => toCsv(rows, { bom: true, eol: "\r\n" });

function printPage(html: string) {
  const frame = document.createElement("iframe");
  frame.title = "Balance sheet"; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

/** The reports pack a bookkeeper can download: the same reports as the owner's tax pack, without the ledger or receipts. */
export function bookkeeperPack(r: BookkeeperReports): [string, Uint8Array][] {
  const enc = new TextEncoder();
  const files: [string, string][] = [
    ["00 Read me.txt", [`${r.pressName}: reports from ${r.day}. Amounts are in ${r.currency}.`, "",
      "The general ledger and receipt files are in the owner's tax pack (Bookkeeping > Reports > Download tax pack)."].join("\r\n")],
    ...r.pl.map((pl, i): [string, string] => [`0${i + 1} Profit and loss ${pl.year}.csv`, csv(profitAndLossRows(pl, r.pressName, r.currency))]),
    [`03 Balance sheet ${r.balance.asOf}.csv`, balanceSheetCsv(r.balance, r.pressName)],
    ...(r.yearEnd ? [[`04 Balance sheet ${r.yearEnd.asOf}.csv`, balanceSheetCsv(r.yearEnd, r.pressName)] as [string, string]] : []),
    [`05 Cash flow forecast ${r.forecast.start}.csv`, forecastCsv(r.forecast, r.pressName)],
  ];
  return files.map(([p, t]) => [p, enc.encode(t)]);
}

export function BookkeeperReportsCard({ load = () => loadBookkeeperSetting(BOOKKEEPER_REPORTS_KEY) }: { load?: () => Promise<unknown> }) {
  const [state, setState] = useState<BookkeeperReports | null | "loading" | "none">("loading");
  useEffect(() => {
    let alive = true;
    load().then((raw) => { if (alive) setState(readBookkeeperReports(raw) || "none"); }, () => { if (alive) setState("none"); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading") return <SectionCard title="Reports"><LoadingState label="Reading the reports…" /></SectionCard>;
  if (state === "none" || !state) {
    return <SectionCard title="Reports"><EmptyState inline title="No reports yet" description="They appear here after the owner opens Bookkeeping › Reports." /></SectionCard>;
  }
  const r = state;
  const money = (n: number) => fmt(n, r.currency);
  const stem = r.pressName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Shop";
  return (
    <>
      <SectionCard title="Balance sheet" description={`As of ${r.balance.asOf}, from the owner's records.`}
        actions={<>
          <SecondaryButton size="sm" onClick={() => downloadCsv(balanceSheetCsv(r.balance, r.pressName), `${stem}_Balance_sheet_${r.balance.asOf}.csv`)}>Spreadsheet</SecondaryButton>
          <SecondaryButton size="sm" onClick={() => printPage(balanceSheetPage(r.balance, r.pressName, money))}>Print or save PDF</SecondaryButton>
        </>}>
        <SheetTable sheet={r.balance} money={money} />
        {r.balance.notes.map((n) => <p key={n} className="rp-money-note">{n}</p>)}
      </SectionCard>
      <SectionCard title="Cash flow, next 90 days" actions={<SecondaryButton size="sm" onClick={() => downloadCsv(forecastCsv(r.forecast, r.pressName), `${stem}_Cash_forecast_${r.forecast.start}.csv`)}>Spreadsheet</SecondaryButton>}>
        <ForecastChart forecast={r.forecast} money={money} />
        <DataTable stackOnPhone caption="Money coming in and going out" rowKey={(it) => `${it.date}:${it.source}:${it.label}:${it.amount}`} rows={r.forecast.items}
          empty={<EmptyState inline title="Nothing dated in the next 90 days" />}
          columns={[
            { key: "d", header: "Date", render: (it) => it.date },
            { key: "w", header: "What", lead: true, render: (it) => it.label },
            { key: "a", header: r.currency, numeric: true, render: (it) => `${it.kind === "in" ? "+" : "-"}${money(it.amount)}` },
          ]} />
      </SectionCard>
      <SectionCard title="Profit and loss" actions={<SecondaryButton size="sm" icon={<Download size={16} aria-hidden />}
        onClick={() => saveFile(`${stem}_Reports_${r.day}.zip`, zipStored(bookkeeperPack(r)), "application/zip")}>All reports (zip)</SecondaryButton>}>
        <table className="rp-bk-pl">
          <tbody>
            <tr data-head=""><td /><td style={{ textAlign: "right" }}><strong>{r.pl.map((p) => p.year).join(" · ")}</strong></td></tr>
            {([["Sales", "revenue"], ["Cost of goods sold", "cogs"], ["Expenses", "opex"], ["Artist shares", "shares"], ["Net profit", "profit"]] as const)
              .filter(([, k]) => k !== "shares" || r.pl.some((p) => p.shares))
              .map(([label, k]) => <tr key={k} data-total={k === "profit" ? "" : undefined}><td>{label}</td><td>{r.pl.map((p) => money(p[k])).join(" · ")}</td></tr>)}
          </tbody>
        </table>
        <p className="rp-money-foot">Updated {r.day}.</p>
      </SectionCard>
    </>
  );
}
