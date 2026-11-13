// Stockroom › Invoices › Quotes (v4 look, like Invoices: three tiles, filter pills with counts, one action per row,
// Create quote in the header). A quote is made in the invoice editor (`kind="quote"`), emailed from the shop's own
// address, and turned into a draft invoice in one click once the customer says yes. Rules in quoteMake.ts; every save
// goes through stockroomWrite.ts and its result is shown (WRITING.md).
import { useMemo, useRef, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { DataTable, Dialog, EmptyState, PageActions, PrimaryButton, SecondaryButton, StatusBadge, Tabs, useConfirm, type Column } from "../riso/components";
import { useShopWords } from "../shopWords";
import { InvoiceEditor, invoiceSettingsOf, useShopNameForInvoices, type InvoiceNotice } from "./InvoiceDialogs";
import { newInvoiceId, stockistNames, todayText, type InvoiceForm } from "./invoiceMake";
import { invoicePage, printInvoice } from "./invoicePaper";
import type { NativePageProps } from "./nativePages";
import {
  acceptQuoteChange, blankQuote, declineQuoteChange, formFromQuote, inQuoteFilter, invoiceNumberFor, markQuoteSentChange, quoteEmail, quoteList,
  quotesSummary, QUOTE_FILTERS, reopenQuoteChange, type QuoteFilter, type QuoteRow,
} from "./quoteMake";
import { RecordsGate } from "./RecordsGate";
import { stockistReceiptApi } from "./stockistReceipt";
import type { StockroomRecords } from "./stockroomData";
import { moneyText } from "./stockists";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import "./money.css";
import "./sales.css";
import "./stockroom.css";
import "./stockists.css";

type Rec = Record<string, any>;

export function QuotesPage({ load, onOpen }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="quotes" load={load}>{(records) => <QuotesBoard initial={records} onOpen={onOpen} />}</RecordsGate>;
}

const STATUS: Record<QuoteRow["status"], { tone: "neutral" | "info" | "success" | "danger" | "warning"; word: string }> = {
  draft: { tone: "neutral", word: "Draft" }, sent: { tone: "info", word: "Waiting" }, accepted: { tone: "success", word: "Accepted" },
  declined: { tone: "neutral", word: "Declined" }, expired: { tone: "warning", word: "Expired" },
};
const badge = (r: QuoteRow) => <StatusBadge tone={STATUS[r.status].tone} glyph={false}>{STATUS[r.status].word}</StatusBadge>;

async function saveBook(bookId: string, mutate: (s: Rec) => Rec, done: string): Promise<{ ok: true; state: Rec; notice: InvoiceNotice } | { ok: false; notice: InvoiceNotice }> {
  try {
    const result = await stockroomWriteApi.saveBookState(bookId, mutate);
    const said = describeResult(result);
    if (result.status === "refused" || result.status === "failed") return { ok: false, notice: { tone: "error", lines: [said.text, "Nothing was changed."] } };
    return { ok: true, state: result.state as Rec, notice: { tone: said.tone, lines: said.tone === "ok" ? [done] : [done, said.text] } };
  } catch (error) {
    return { ok: false, notice: { tone: "error", lines: [error instanceof Error ? error.message : "That didn't save. Try again.", "Nothing was changed."] } };
  }
}

function Note({ notice }: { notice: InvoiceNotice }) {
  return <div className="rp-sk-notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.lines.map((l) => <p key={l}>{l}</p>)}</div>;
}

type Open = { kind: "edit"; form: InvoiceForm } | { kind: "view"; id: string };

export function QuotesBoard({ initial, onOpen }: { initial: StockroomRecords; onOpen?: NativePageProps["onOpen"] }) {
  const w = useShopWords();
  const [records, setRecords] = useState(initial);
  const shopName = useShopNameForInvoices();
  const settings = invoiceSettingsOf(records, shopName);
  const rows = useMemo(() => quoteList(records), [records]);
  const summary = useMemo(() => quotesSummary(rows), [rows]);
  const [filter, setFilter] = useState<QuoteFilter>("all");
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<InvoiceNotice | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [shown, setShown] = useState(10);
  const [ask, confirmNode] = useConfirm();
  // One invoice id per quote being accepted, fixed before the first try, so a retry can't make two invoices.
  const invoiceIds = useRef(new Map<string, string>());
  const stateSaved = (bookId: string, state: Rec) => setRecords((r) => ({ ...r, states: { ...r.states, [bookId]: state } }));
  const listed = rows.filter((r) => inQuoteFilter(r, filter));
  const current = open?.kind === "view" ? rows.find((r) => r.id === open.id) || null : null;
  const canMake = records.books.length > 0;

  const run = async (r: QuoteRow, mutate: (s: Rec) => Rec, done: string) => {
    if (acting) return false;
    setActing(r.id); setNotice(null);
    const res = await saveBook(r.ownerBookId, mutate, done);
    setActing(null);
    setNotice(res.notice);
    if (res.ok) stateSaved(r.ownerBookId, res.state);
    return res.ok;
  };
  const accept = async (r: QuoteRow) => {
    if (!(await ask({ title: `Turn ${r.num || "this quote"} into an invoice?`, message: `A draft invoice for ${fmt(r.total, r.code)} to ${r.billedTo} is made with the same lines. You can check it, then send it.`, confirmLabel: "Make the invoice" }))) return;
    const invoiceId = invoiceIds.current.get(r.id) || newInvoiceId(Date.now());
    invoiceIds.current.set(r.id, invoiceId);
    const num = invoiceNumberFor(records, r, settings);
    const ok = await run(r, acceptQuoteChange(records, r, { invoiceId, num, now: Date.now(), today: todayText() }), `${r.num || "The quote"} is accepted. Invoice ${num} is waiting as a draft under Invoices.`);
    if (ok) setOpen(null);
  };
  const email = async (r: QuoteRow) => {
    const mail = quoteEmail(r.quote, settings, r.code);
    if (!mail.to) { setNotice({ tone: "warn", lines: ["No email address on this quote. Edit it to add one."] }); return; }
    if (!(await ask({ title: `Email ${r.num || "this quote"}?`, message: `It goes to ${mail.to} from your shop's address, with the lines and the total.`, confirmLabel: "Send it" }))) return;
    if (acting) return;
    setActing(r.id); setNotice(null);
    try { await stockistReceiptApi.sendNote(mail); }
    catch (e) { setActing(null); setNotice({ tone: "error", lines: [`The quote wasn't sent: ${e instanceof Error ? e.message : "try again in a minute."}`] }); return; }
    setActing(null);
    const res = await saveBook(r.ownerBookId, markQuoteSentChange(r.id, Date.now(), { to: mail.to }), `${r.num || "Quote"} emailed to ${mail.to}.`);
    if (!res.ok) { setNotice({ tone: "warn", lines: [`${r.num || "The quote"} was emailed to ${mail.to}, but couldn't be marked sent.`, ...res.notice.lines] }); return; }
    stateSaved(r.ownerBookId, res.state); setNotice(res.notice);
  };

  const action = (r: QuoteRow) => {
    if (r.status === "draft") return <SecondaryButton size="sm" busy={acting === r.id} disabled={!!acting} onClick={() => run(r, markQuoteSentChange(r.id, Date.now()), `${r.num || "Quote"} is marked sent.`)} aria-label={`Mark ${r.num} sent`}>Mark sent</SecondaryButton>;
    if (r.status === "sent" || r.status === "expired") return <SecondaryButton size="sm" busy={acting === r.id} disabled={!!acting} onClick={() => accept(r)} aria-label={`Turn ${r.num} into an invoice`}>Make invoice</SecondaryButton>;
    if (r.status === "accepted" && r.invoiceNum) return <span className="rp-hint">Invoice {r.invoiceNum}</span>;
    return <span className="rp-sk-uptodate">—</span>;
  };
  const columns: Column<QuoteRow>[] = [
    { key: "num", header: "Quote", lead: true, render: (r) => <button type="button" className="rp-sr-open" onClick={() => { setNotice(null); setOpen({ kind: "view", id: r.id }); }} aria-label={`Open ${r.num || "quote"} for ${r.billedTo}`}>{r.num || "Quote"}</button> },
    { key: "who", header: "Customer", render: (r) => r.person ? <>{r.billedTo}<div className="rp-hint">Not a stockist</div></> : r.billedTo },
    { key: "date", header: "Date", render: (r) => r.date ? fmtD(r.date) : "—" },
    { key: "until", header: "Valid until", render: (r) => r.validUntil ? fmtD(r.validUntil) : "—" },
    { key: "total", header: "Amount", numeric: true, render: (r) => fmt(r.total, r.code) },
    { key: "status", header: "Status", render: badge },
    { key: "action", header: "Action", render: action },
  ];

  if (open?.kind === "edit") {
    return <InvoiceEditor kind="quote" records={records} settings={settings} start={open.form} onClose={() => setOpen(null)}
      onSaved={(bookId, state, n) => { stateSaved(bookId, state); setNotice(n); setOpen(null); }} />;
  }
  return (
    <div className="rp-sk">
      <PageActions>
        {canMake && <PrimaryButton onClick={() => { setNotice(null); setOpen({ kind: "edit", form: blankQuote(records, settings, { person: !stockistNames(records).length }) }); }}>Create quote</PrimaryButton>}
      </PageActions>
      {notice && <Note notice={notice} />}
      {rows.length ? <>
        <ul className="rp-sk-tiles" aria-label="Quotes at a glance">
          <li className="rp-sk-tile" data-tone="sky"><span>Waiting on a reply</span><strong>{moneyText(summary.waiting) || "Nothing"}</strong>
            <small>{summary.waitingCount === 1 ? "1 quote" : `${summary.waitingCount} quotes`}</small></li>
          <li className="rp-sk-tile" data-tone="mint"><span>Won, last 30 days</span><strong>{moneyText(summary.won30) || "Nothing yet"}</strong>
            <small>{summary.won30Count === 1 ? "1 quote" : `${summary.won30Count} quotes`}</small></li>
          <li className="rp-sk-tile" data-tone={summary.expiredCount ? "apricot" : undefined}><span>Past their date</span><strong>{summary.expiredCount || "None"}</strong>
            <small>{summary.expiredCount ? "Follow up or let go" : "All current"}</small></li>
        </ul>
        <Tabs label="Show quotes" idPrefix="quo-" value={filter} onChange={(f) => { setFilter(f); setShown(10); }}
          tabs={QUOTE_FILTERS.map((f) => ({ id: f.id, label: f.label, count: summary.counts[f.id] }))} />
        <section className="rp-card rp-reorder-card" aria-label="Quotes">
          {listed.length ? <>
            <DataTable caption="Quotes" columns={columns} rows={listed.slice(0, shown)} rowKey={(r) => r.id} stackOnPhone onRowClick={(r) => { setNotice(null); setOpen({ kind: "view", id: r.id }); }} />
            {listed.length > shown && <SecondaryButton size="sm" onClick={() => setShown((n) => n + 20)}>Show more ({listed.length - shown} left)</SecondaryButton>}
          </> : <EmptyState inline icon="📝" title="Nothing here" description="No quotes with this status." />}
        </section>
      </> : <section className="rp-card rp-reorder-card"><EmptyState inline icon="📝" title="No quotes yet" description={w(canMake ? "Send a price before the sale. When they say yes, it becomes an invoice in one click." : "Add a title first, then send quotes from here.")} /></section>}
      {confirmNode}
      {current && (
        <Dialog open size="lg" onClose={acting ? () => undefined : () => setOpen(null)} title={current.num || "Quote"} description={`${current.billedTo} · ${fmt(current.total, current.code)} · ${STATUS[current.status].word}`}
          footer={<>
            {current.status !== "accepted" && <SecondaryButton onClick={() => setOpen({ kind: "edit", form: formFromQuote(records, current) })} disabled={!!acting}>Edit</SecondaryButton>}
            {(current.status === "draft" || current.status === "sent" || current.status === "expired") && <SecondaryButton onClick={() => email(current)} disabled={!!acting}>Email it</SecondaryButton>}
            {(current.status === "sent" || current.status === "expired" || current.status === "draft") && <SecondaryButton onClick={() => run(current, declineQuoteChange(current.id, Date.now()), `${current.num || "Quote"} is marked declined.`)} disabled={!!acting}>They said no</SecondaryButton>}
            {current.status === "declined" && <SecondaryButton onClick={() => run(current, reopenQuoteChange(current.id, Date.now()), `${current.num || "Quote"} is open again.`)} disabled={!!acting}>Open it again</SecondaryButton>}
            {current.status === "accepted" && onOpen && <SecondaryButton onClick={() => onOpen("invoices")}>Go to invoices</SecondaryButton>}
            <SecondaryButton onClick={() => printInvoice(current.quote, settings, todayText(), { quote: true })} disabled={!!acting}>Print or save PDF</SecondaryButton>
            {current.status !== "accepted" && current.status !== "declined" && <PrimaryButton onClick={() => accept(current)} busy={acting === current.id}>Accepted: make invoice</PrimaryButton>}
          </>}>
          {notice && <Note notice={notice} />}
          {current.status === "accepted" && <p className="rp-hint">Accepted{current.quote.acceptedAt ? ` on ${fmtD(new Date(current.quote.acceptedAt).toLocaleDateString("en-CA"))}` : ""}. It became invoice {current.invoiceNum || "—"}.</p>}
          {Array.isArray(current.quote.emails) && current.quote.emails.length > 0 && <p className="rp-hint">Emailed {current.quote.emails.length === 1 ? "once" : `${current.quote.emails.length} times`}, last to {current.quote.emails[current.quote.emails.length - 1].to}.</p>}
          <iframe className="rp-inv-paper" title={`Quote ${current.num}`} srcDoc={invoicePage(current.quote, settings, todayText(), { quote: true })} />
        </Dialog>
      )}
    </div>
  );
}
