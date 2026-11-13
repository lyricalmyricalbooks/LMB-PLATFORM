// Stockroom › Invoices › Repeating: invoices made for you on a schedule (a stockist billed every month). Set one up here
// or from an invoice (Repeat it). The admin makes each invoice when its day comes and, if asked, emails it; from then on
// it is an ordinary invoice under Invoices. Rules in recurringInvoices.ts, the run in AutoReminders.tsx.
import { useMemo, useState } from "react";
import { fmtD } from "@stockroom/money.js";

import { DataTable, EmptyState, PageActions, PrimaryButton, SecondaryButton, StatusBadge, useConfirm, type Column } from "../riso/components";
import { useShopWords } from "../shopWords";
import { InvoiceEditor, invoiceSettingsOf, useShopNameForInvoices, type InvoiceNotice } from "./InvoiceDialogs";
import { blankForm, stockistNames, todayText, type InvoiceForm } from "./invoiceMake";
import type { NativePageProps } from "./nativePages";
import {
  blankSchedule, deleteRepeatChange, everyWord, formFromRepeat, pauseRepeatChange, repeatAmount, repeatList, type RepeatRow, type Schedule,
} from "./recurringInvoices";
import { RecordsGate } from "./RecordsGate";
import type { StockroomRecords } from "./stockroomData";
import { addMoney, moneyText, type Owed } from "./stockists";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import "./money.css";
import "./sales.css";
import "./stockroom.css";
import "./stockists.css";

type Rec = Record<string, any>;

export function RepeatingPage({ load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="repeating invoices" load={load}>{(records) => <RepeatingBoard initial={records} />}</RecordsGate>;
}

function Note({ notice }: { notice: InvoiceNotice }) {
  return <div className="rp-sk-notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.lines.map((l) => <p key={l}>{l}</p>)}</div>;
}

/** What one month of the active patterns bills, per currency (a weekly one counts about 4⅓ times, a yearly one a twelfth). */
export function monthlyValue(rows: RepeatRow[]): Owed[] {
  const out: Owed[] = [];
  const per = { week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 } as const;
  for (const r of rows) if (r.status === "active") addMoney(out, r.code, Math.round(r.total * per[r.every] * 100) / 100);
  return out;
}

export function RepeatingBoard({ initial }: { initial: StockroomRecords }) {
  const w = useShopWords();
  const [records, setRecords] = useState(initial);
  const shopName = useShopNameForInvoices();
  const settings = invoiceSettingsOf(records, shopName);
  const rows = useMemo(() => repeatList(records), [records]);
  const [editing, setEditing] = useState<{ form: InvoiceForm; schedule: Schedule } | null>(null);
  const [notice, setNotice] = useState<InvoiceNotice | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [ask, confirmNode] = useConfirm();
  const stateSaved = (bookId: string, state: Rec) => setRecords((r) => ({ ...r, states: { ...r.states, [bookId]: state } }));
  const active = rows.filter((r) => r.status === "active");
  const nextUp = active.filter((r) => r.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  const canMake = records.books.length > 0;

  const run = async (r: RepeatRow, mutate: (s: Rec) => Rec, done: string) => {
    if (acting) return;
    setActing(r.id); setNotice(null);
    try {
      const result = await stockroomWriteApi.saveBookState(r.ownerBookId, mutate);
      const said = describeResult(result);
      if (result.status === "refused" || result.status === "failed") setNotice({ tone: "error", lines: [said.text, "Nothing was changed."] });
      else { stateSaved(r.ownerBookId, result.state as Rec); setNotice({ tone: said.tone, lines: said.tone === "ok" ? [done] : [done, said.text] }); }
    } catch (e) {
      setNotice({ tone: "error", lines: [e instanceof Error ? e.message : "That didn't save.", "Nothing was changed."] });
    } finally { setActing(null); }
  };
  const remove = async (r: RepeatRow) => {
    if (!(await ask({ title: `Stop billing ${r.billedTo}?`, message: "No more invoices are made from it. The invoices it already made stay.", confirmLabel: "Delete it" }))) return;
    await run(r, deleteRepeatChange(r.id), `The repeating invoice for ${r.billedTo} is deleted.`);
  };

  const statusCell = (r: RepeatRow) => r.problem ? <StatusBadge tone="danger">Needs a look</StatusBadge>
    : r.status === "active" ? <StatusBadge tone="success" glyph={false}>On</StatusBadge>
      : <StatusBadge tone="neutral" glyph={false}>{r.status === "paused" ? "Paused" : "Ended"}</StatusBadge>;
  const columns: Column<RepeatRow>[] = [
    { key: "who", header: "Customer", lead: true, render: (r) => <button type="button" className="rp-sr-open" onClick={() => { setNotice(null); setEditing(formFromRepeat(records, r)); }} aria-label={`Edit the repeating invoice for ${r.billedTo}`}>{r.billedTo}</button> },
    { key: "every", header: "How often", render: (r) => everyWord(r.every) },
    { key: "next", header: "Next", render: (r) => r.status === "active" && r.nextDate ? <span style={{ whiteSpace: "nowrap" }}>{fmtD(r.nextDate)}</span> : "—" },
    { key: "amount", header: "Amount", numeric: true, render: repeatAmount },
    { key: "send", header: "Sending", render: (r) => r.autoEmail ? (r.email ? "Emailed for you" : <span className="rp-hint">No email: waits as a draft</span>) : "Waits as a draft" },
    { key: "last", header: "Last made", render: (r) => r.lastMade ? <><span style={{ whiteSpace: "nowrap" }}>{r.lastMade.num || "—"}</span><div className="rp-hint">{fmtD(r.lastMade.date)}</div></> : "Not yet" },
    { key: "status", header: "Status", render: (r) => <>{statusCell(r)}{r.problem && <div className="rp-hint">{r.problem}</div>}</> },
    { key: "action", header: "Action", render: (r) => <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {r.status !== "ended" && <SecondaryButton size="sm" busy={acting === r.id} disabled={!!acting} onClick={() => run(r, pauseRepeatChange(r.id, r.status === "active", todayText(), Date.now()), r.status === "active" ? `Paused. Nothing more is billed to ${r.billedTo} until you start it again.` : `Started again. The next invoice is made on ${fmtD(r.nextDate < todayText() ? todayText() : r.nextDate)}.`)}>{r.status === "active" ? "Pause" : "Start again"}</SecondaryButton>}
      <SecondaryButton size="sm" disabled={!!acting} onClick={() => remove(r)} aria-label={`Delete the repeating invoice for ${r.billedTo}`}>Delete</SecondaryButton>
    </div> },
  ];

  if (editing) {
    return <InvoiceEditor kind="repeat" records={records} settings={settings} start={editing.form} startSchedule={editing.schedule} onClose={() => setEditing(null)}
      onSaved={(bookId, state, n) => { stateSaved(bookId, state); setNotice(n); setEditing(null); }}
      onDeleted={(bookId, state, n) => { stateSaved(bookId, state); setNotice(n); setEditing(null); }} />;
  }
  return (
    <div className="rp-sk">
      <PageActions>
        {canMake && <PrimaryButton onClick={() => { setNotice(null); setEditing({ form: blankForm(records, settings, { person: !stockistNames(records).length }), schedule: blankSchedule() }); }}>Set up a repeating invoice</PrimaryButton>}
      </PageActions>
      {notice && <Note notice={notice} />}
      {rows.length ? <>
        <ul className="rp-sk-tiles" aria-label="Repeating invoices at a glance">
          <li className="rp-sk-tile" data-tone="mint"><span>Billed each month</span><strong>{moneyText(monthlyValue(rows)) || "Nothing"}</strong>
            <small>{active.length === 1 ? "1 customer" : `${active.length} customers`}</small></li>
          <li className="rp-sk-tile" data-tone="sky"><span>Next invoice</span><strong>{nextUp ? fmtD(nextUp.nextDate) : "None"}</strong>
            <small>{nextUp ? `${nextUp.billedTo} · ${repeatAmount(nextUp)}` : "Nothing scheduled"}</small></li>
          <li className="rp-sk-tile" data-tone={rows.some((r) => r.problem) ? "apricot" : undefined}><span>Made so far</span><strong>{rows.reduce((n, r) => n + r.madeCount, 0)}</strong>
            <small>{rows.some((r) => r.problem) ? "One needs a look" : "All going"}</small></li>
        </ul>
        <section className="rp-card rp-reorder-card" aria-label="Repeating invoices">
          <DataTable caption="Repeating invoices" columns={columns} rows={rows} rowKey={(r) => r.id} stackOnPhone />
        </section>
        <p className="rp-hint">Invoices are made when their day comes, while your admin is open on a weekday between 9 and 6. Each one then shows under Invoices, and late ones get your usual reminders.</p>
      </> : <section className="rp-card rp-reorder-card"><EmptyState inline icon="🔁" title="No repeating invoices yet" description={w(canMake ? "Bill a stockist or a subscriber on a schedule. Each invoice is made and emailed for you." : "Add a title first, then set up repeating invoices here.")} /></section>}
      {confirmNode}
    </div>
  );
}
