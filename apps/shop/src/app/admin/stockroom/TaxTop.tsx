// The Tax centre's sales tax parts (11 November 2026; v4 split them over three pages, `part`): period pills, four tiles
// (tax to remit, sales, fees, before you file), tax by rate and place, tax by channel and past filings. Figures from taxPeriods.ts.
import { useState } from "react";
import { downloadCsv } from "@stockroom/download.js";

import { DataTable, EmptyState, PageActions, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, Tabs } from "../riso/components";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";
import { dueOf, filingsOf, pastQuarters, taxPeriodModel, taxReportRows, type TaxPeriod, type TaxPeriodModel } from "./taxPeriods";
import "./taxTop.css";

type Row = Record<string, any>;

const dayWords = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const csvText = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

/** v4 splits the Tax centre into pages: Sales tax (tiles), Rates and places, Filings; "all" draws every part. */
export type TaxTopPart = "all" | "salestax" | "rates" | "filings";

export function TaxTop({ periods, period, onPeriod, orders, ledgerRows, states, taxCenter, currency, now, onTaxCenter, part = "all" }: {
  periods: TaxPeriod[]; period: TaxPeriod; onPeriod: (id: string) => void; part?: TaxTopPart;
  /** The shop's orders; "loading" or "failed" while they can't be counted. */
  orders: Row[] | "loading" | "failed";
  ledgerRows: Row[]; states: Record<string, Row>; taxCenter: Row | null; currency: string; now: number;
  onTaxCenter?: (taxCenter: Record<string, unknown>) => void;
}) {
  const ready = Array.isArray(orders);
  const model = taxPeriodModel({ orders: ready ? orders : [], ledgerRows, states, period, currency });
  const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(cents / 100);
  const pending = ready ? null : orders === "loading" ? "Counting…" : "Couldn't load website orders";
  const download = () => downloadCsv(csvText(taxReportRows(model, period, currency)), `Tax_report_${period.id}.csv`);

  const on = (p: TaxTopPart) => part === "all" || part === p;
  const ratesCard = (
    <SectionCard title="Tax by rate and place" flush>
      <DataTable stackOnPhone caption="Tax by rate and place" rowKey={(r) => r.id} rows={ready ? model.rates : []}
        empty={<EmptyState inline title={pending ?? "No sales in this period"} />}
        columns={[
          { key: "r", header: "Rate", lead: true, render: (r) => <>{r.name}<span className="rp-tax-sub">{r.note}</span></> },
          { key: "n", header: "Net sales", numeric: true, render: (r) => money(r.netCents) },
          { key: "t", header: "Tax", numeric: true, render: (r) => <strong>{money(r.taxCents)}</strong> },
          { key: "o", header: "Orders", numeric: true, render: (r) => r.orders },
        ]} />
      {ready && model.rates.length > 0 && <p className="rp-tax-total"><span>Total</span><strong>{money(model.taxCents)}</strong></p>}
    </SectionCard>
  );
  const channelCard = (
    <SectionCard title="Tax by channel">
      {ready ? <ChannelBars model={model} money={money} /> : <p className="rp-tax-sub">{pending}</p>}
    </SectionCard>
  );
  const filings = <PastFilings orders={ready ? orders : null} ledgerRows={ledgerRows} states={states} taxCenter={taxCenter} currency={currency} now={now} money={money} onTaxCenter={onTaxCenter} />;

  return (
    <>
      {on("salestax") && <PageActions><PrimaryButton onClick={download} disabled={!ready}>Download report</PrimaryButton></PageActions>}
      {(on("salestax") || on("rates")) && <div className="rp-tax-period">
        <span className="rp-tax-period-label" id="rp-tax-period">Period</span>
        <Tabs label="Period" idPrefix="tax-" value={period.id} onChange={onPeriod}
          tabs={periods.map((p) => ({ id: p.id, label: p.quarter && p.open ? `${p.label} · open` : p.label }))} />
      </div>}
      {on("salestax") && <div className="rp-tax-tiles">
        <RemitTile period={period} model={model} money={money} pending={pending} now={now} />
        <div className="rp-tax-tile">
          <p className="rp-tax-tile-label">Sales in period</p>
          <p className="rp-tax-tile-value">{pending ?? money(model.salesCents)}</p>
          <p className="rp-tax-tile-foot">{model.salesCount} {model.salesCount === 1 ? "sale" : "sales"}{model.refunds > 0 && ` · refunds ${money(model.refundsCents)}`}</p>
        </div>
        <div className="rp-tax-tile">
          <p className="rp-tax-tile-label">Card and platform fees</p>
          <p className="rp-tax-tile-value">{pending ?? (model.feesKnown ? money(model.feesCents) : "None yet")}</p>
          <p className="rp-tax-tile-foot">{!model.feesKnown ? "Fees show once a card payment comes in" : model.unpaidOut ? `Deductible · ${model.unpaidOut} waiting for a payout` : "Deductible · matched to payouts"}</p>
        </div>
        <div className="rp-tax-tile" data-tone="apricot">
          <p className="rp-tax-tile-title">Before you file</p>
          {ready
            ? <ul className="rp-tax-checks">{model.checks.map((c) => <li key={c.id}><span>{c.text}</span><strong>{c.done ? "Done" : "Check"}</strong></li>)}</ul>
            : <p className="rp-tax-tile-foot">{pending}</p>}
        </div>
      </div>}
      {part === "all" && <div className="rp-tax-split">
        {ratesCard}
        <div className="rp-tax-side">{channelCard}{filings}</div>
      </div>}
      {part === "rates" && <div className="rp-tax-split">{ratesCard}<div className="rp-tax-side">{channelCard}</div></div>}
      {part === "filings" && filings}
    </>
  );
}

function RemitTile({ period, model, money, pending, now }: { period: TaxPeriod; model: TaxPeriodModel; money: (c: number) => string; pending: string | null; now: number }) {
  const due = period.quarter ? dueOf(period, now) : null;
  const short = period.quarter ? period.label.split(" ")[0] : "this year";
  return (
    <div className="rp-tax-tile" data-tone="sky">
      <p className="rp-tax-tile-label">Tax to remit · {short}</p>
      <p className="rp-tax-tile-value">{pending ?? money(model.taxCents)}</p>
      {due && <p className="rp-tax-tile-due">{due.daysLeft >= 0 ? `Due ${dayWords(due.due)} · ${due.daysLeft} ${due.daysLeft === 1 ? "day" : "days"} left` : `Was due ${dayWords(due.due)}`}</p>}
      {due && (
        <div className="rp-tax-progress">
          <div className="rp-tax-bar" role="progressbar" aria-label="How far through the quarter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={due.through}><span style={{ width: `${due.through}%` }} /></div>
          <p className="rp-tax-tile-foot">{period.open ? `Quarter ${due.through}% through` : "Quarter ended"}</p>
        </div>
      )}
      {!due && <p className="rp-tax-tile-foot">Website sales tax since 1 January</p>}
    </div>
  );
}

function ChannelBars({ model, money }: { model: TaxPeriodModel; money: (c: number) => string }) {
  const max = Math.max(1, ...model.channels.map((c) => c.taxCents ?? 0));
  return (
    <ul className="rp-tax-bars">
      {model.channels.map((c) => (
        <li key={c.id}>
          <span>{c.name}</span>
          <div className="rp-tax-bar" aria-hidden="true"><span style={{ width: `${Math.round(((c.taxCents ?? 0) / max) * 100)}%` }} /></div>
          <strong>{c.taxCents === null ? <span className="rp-tax-sub" title={`${money(c.salesCents)} in sales`}>Not recorded</span> : money(c.taxCents)}</strong>
        </li>
      ))}
    </ul>
  );
}

function PastFilings({ orders, ledgerRows, states, taxCenter, currency, now, money, onTaxCenter }: {
  orders: Row[] | null; ledgerRows: Row[]; states: Record<string, Row>; taxCenter: Row | null; currency: string; now: number;
  money: (c: number) => string; onTaxCenter?: (taxCenter: Record<string, unknown>) => void;
}) {
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState("");
  const filings = filingsOf(taxCenter);
  const quarters = pastQuarters(3, now).map((p) => ({
    period: p,
    taxCents: orders ? taxPeriodModel({ orders, ledgerRows, states, period: p, currency }).taxCents : null,
    filed: filings[p.id] || null,
  }));
  const mark = async (id: string, taxCents: number, filed: boolean) => {
    setBusy(id); setNote({ tone: "busy", text: "Saving…" });
    const result = await saveTaxCenter((current) => {
      const next = { ...(current || {}) } as Row;
      const all = { ...filingsOf(next) };
      if (filed) all[id] = { filedAt: new Date(now).toISOString(), taxCents };
      else delete all[id];
      next.filings = all;
      return next;
    }, filed ? "Marked as filed." : "Marked as not filed.");
    setBusy(""); setNote(result.note);
    if (result.ok && result.taxCenter) onTaxCenter?.(result.taxCenter);
  };
  return (
    <SectionCard title="Past filings">
      <ul className="rp-tax-filings">
        {quarters.map((q) => (
          <li key={q.period.id}>
            <div>
              <strong>{q.period.label}</strong>
              <span className="rp-tax-sub">Tax {q.filed ? money(q.filed.taxCents) : q.taxCents === null ? "…" : money(q.taxCents)}</span>
            </div>
            {q.filed
              ? <span className="rp-tax-filed"><StatusBadge tone="success">Filed</StatusBadge>{onTaxCenter && <SecondaryButton onClick={() => mark(q.period.id, 0, false)} disabled={!!busy} aria-label={`Undo filed for ${q.period.label}`}>Undo</SecondaryButton>}</span>
              : onTaxCenter && q.taxCents !== null
                ? <SecondaryButton onClick={() => mark(q.period.id, q.taxCents!, true)} disabled={!!busy}>Mark filed</SecondaryButton>
                : <StatusBadge>Not filed</StatusBadge>}
          </li>
        ))}
      </ul>
      {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
    </SectionCard>
  );
}
