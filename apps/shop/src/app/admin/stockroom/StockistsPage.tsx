// Stockroom › Stockists, drawn by the admin itself (no frame): the shops holding your copies on consignment, what each
// owes, which invoices are overdue, and a drawer with one stockist's titles, invoices and ledger. Writes (through
// stockroomWrite.ts, WRITING.md): Mark paid on an invoice, with an optional emailed receipt, and the Invoices card
// (InvoiceDialogs.tsx): make, edit, send, delete and print invoices, and the invoice details they print with.
import { useMemo, useState } from "react";
import { LEDGER_TYPE_FILTERS } from "@stockroom/consignment-ledger-filter.js";
import { fmt, fmtD } from "@stockroom/money.js";

import { Checkbox, DataTable, Dialog, Drawer, EmptyState, InkButton, SecondaryButton, StatusBadge, type BadgeTone, type Column } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { InvoicesCard } from "./InvoiceDialogs";
import { RecordsGate } from "./RecordsGate";
import type { StockroomRecords } from "./stockroomData";
import { stockistReceiptApi } from "./stockistReceipt";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { buildStockists, markInvoicePaid, moneyText, type Stockist, type StockistInvoice, type StockistLedgerRow, type StockistsView } from "./stockists";
import "./money.css";
import "./stockroom.css";
import "./stockists.css";

const STATE_BADGE: Record<Stockist["state"], { tone: BadgeTone; words: string }> = {
  overdue: { tone: "danger", words: "Invoice overdue" },
  mismatch: { tone: "danger", words: "Doesn't match the ledger" },
  owes: { tone: "warning", words: "Payment due" },
  settled: { tone: "neutral", words: "Settled" },
  holding: { tone: "success", words: "Holding copies" },
  new: { tone: "neutral", words: "No copies yet" },
};

const where = (s: Stockist) => [s.city, s.region, s.country].filter(Boolean).join(", ");

function InvoiceRows({ invoices, onPay }: { invoices: StockistInvoice[]; onPay?: (i: StockistInvoice) => void }) {
  if (!invoices.length) return <p className="rp-sk-none">No invoices for this stockist.</p>;
  return (
    <ul className="rp-sk-list">
      {invoices.map((i) => (
        <li key={i.id} className="rp-sk-row">
          <div className="rp-sk-row-main"><strong>{i.num || "Invoice"}</strong><span className="rp-sk-meta">{i.dueDate ? `Due ${fmtD(i.dueDate)}` : "No due date"}{i.chased ? ` · reminded ${i.chased === 1 ? "once" : `${i.chased} times`}` : ""}{i.promisedUntil ? ` · promised by ${fmtD(i.promisedUntil)}` : ""}{i.reminderFailed ? " · last reminder didn't send" : ""}</span></div>
          <div className="rp-sk-row-end"><span className="rp-sk-amount">{fmt(i.total, i.code)}</span>
            {i.overdue ? <StatusBadge tone="danger">{i.daysLate ?? 0} days overdue</StatusBadge> : <StatusBadge tone={i.status === "paid" ? "success" : "neutral"} glyph={false}>{i.status[0].toUpperCase() + i.status.slice(1)}</StatusBadge>}
            {onPay && i.payable && <SecondaryButton size="sm" onClick={() => onPay(i)} aria-label={`Mark ${i.num || "this invoice"} paid`}>Mark paid</SecondaryButton>}</div>
        </li>
      ))}
    </ul>
  );
}

function ledgerBadge(r: StockistLedgerRow) {
  if (r.voided) return <StatusBadge tone="neutral" glyph={false}>Void</StatusBadge>;
  if (r.type === "Shipment") return <StatusBadge tone="info" glyph={false}>Sent</StatusBadge>;
  if (r.status === "paid") return <StatusBadge tone="success" glyph={false}>Paid</StatusBadge>;
  if (r.status === "pending") return <StatusBadge tone="warning" glyph={false}>Pending</StatusBadge>;
  return <StatusBadge tone="neutral" glyph={false}>{r.status ? r.status[0].toUpperCase() + r.status.slice(1) : r.type}</StatusBadge>;
}

function Ledger({ rows }: { rows: StockistLedgerRow[] }) {
  const [type, setType] = useState<string | null>(null);
  const shown = type ? rows.filter((r) => r.type === type) : rows;
  const chip = (key: string | null, label: string) => {
    const Btn = type === key ? InkButton : SecondaryButton;
    return <Btn key={label} size="sm" aria-pressed={type === key} onClick={() => setType(key)}>{label}</Btn>;
  };
  return (
    <>
      <div className="rp-sk-chips" role="group" aria-label="Show ledger entries">{chip(null, `All ${rows.length}`)}{LEDGER_TYPE_FILTERS.map((f) => chip(f.key, f.label))}</div>
      {!shown.length ? <p className="rp-sk-none">Nothing to show for this filter.</p> : (
        <ul className="rp-sk-list">
          {shown.map((r) => (
            <li key={r.key} className="rp-sk-row" data-voided={r.voided || undefined}>
              <div className="rp-sk-row-main"><strong>{r.type === "Shipment" ? "Sent out" : r.type === "Sale" ? "Sold" : r.type === "Return" ? "Returned" : r.type} · {r.qty} {r.qty === 1 ? "copy" : "copies"}</strong>
                <span className="rp-sk-meta">{[fmtD(r.date), r.bookTitle, r.rate != null ? `${r.rate}% to the stockist` : "", r.invoiceNum, r.notes].filter(Boolean).join(" · ")}</span></div>
              <div className="rp-sk-row-end"><span className="rp-sk-amount">{r.amountDue > 0 ? fmt(r.amountDue, r.code) : "—"}</span>{ledgerBadge(r)}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Detail({ s, onPay, notice, onNewInvoice }: { s: Stockist; onPay?: (i: StockistInvoice) => void; notice?: Notice | null; onNewInvoice?: () => void }) {
  const w = useShopWords();
  const contact = [s.contact, s.email, s.phone, s.website].filter(Boolean);
  return (
    <div className="rp-sk-detail">
      <p className="rp-sk-meta">{[where(s), `${s.rate}% commission`, s.terms].filter(Boolean).join(" · ")}</p>
      {contact.length > 0 && <p className="rp-sk-meta">{contact.join(" · ")}</p>}
      {s.notes && <p className="rp-sk-meta">{s.notes}</p>}
      {(s.mismatch || s.owedMismatch) && (
        <p className="rp-sk-alert" role="status">{w("The running totals saved for this stockist don't match what the ledger adds up to. The ledger is the one to trust; the balance below shows which figure differs.")}</p>
      )}
      <h3 className="rp-sk-h">Balance</h3>
      <ul className="rp-sk-list">
        {s.titles.map((t) => (
          <li key={t.bookId} className="rp-sk-row">
            <div className="rp-sk-row-main"><strong>{t.bookTitle}</strong><span className="rp-sk-meta">Sent {t.sent} · sold {t.sold} · returned {t.returned} · on their shelf {t.onShelf}</span>
              {t.mismatch && <span className="rp-sk-meta rp-sk-warn">{t.figures.filter((f) => f.off).map((f) => `${f.label}: card ${f.card}, ledger ${f.ledger}`).join(" · ")}</span>}</div>
            <div className="rp-sk-row-end"><span className="rp-sk-amount">{t.owed > 0 ? fmt(t.owed, t.code) : "—"}</span></div>
          </li>
        ))}
      </ul>
      {s.paid.length > 0 && <p className="rp-sk-meta">Already paid: {moneyText(s.paid)}</p>}
      <div className="rp-inv-head"><h3 className="rp-sk-h">Invoices</h3>{onNewInvoice && <SecondaryButton size="sm" onClick={onNewInvoice}>New invoice</SecondaryButton>}</div>
      {notice && <NoticeLine notice={notice} />}
      <InvoiceRows invoices={s.invoices} onPay={onPay} />
      <h3 className="rp-sk-h">Ledger</h3>
      {s.ledger.length ? <Ledger rows={s.ledger} /> : <p className="rp-sk-none">Nothing in the ledger for this stockist yet.</p>}
    </div>
  );
}

type Notice = { tone: "ok" | "warn" | "error"; lines: string[] };

function NoticeLine({ notice }: { notice: Notice }) {
  return <div className="rp-sk-notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.lines.map((l) => <p key={l}>{l}</p>)}</div>;
}

const today = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Mark one invoice paid: saved through the stockroom write layer, then (only if ticked) a receipt to the stockist. */
function PayDialog({ s, inv, onClose, onSaved }: {
  s: Stockist; inv: StockistInvoice; onClose: () => void; onSaved: (bookId: string, state: Record<string, any>, notice: Notice) => void;
}) {
  const w = useShopWords();
  const email = inv.email || s.email;
  const [receipt, setReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Notice | null>(null);
  const amount = fmt(inv.total, inv.code);
  const pay = async () => {
    if (busy) return;
    setBusy(true); setProblem(null);
    let result;
    try {
      result = await stockroomWriteApi.saveBookState(inv.bookId, markInvoicePaid(inv.id, Date.now()));
    } catch (error) {
      setBusy(false);
      setProblem({ tone: "error", lines: [error instanceof Error ? error.message : "Nothing was saved. Try again."] });
      return;
    }
    const said = describeResult(result);
    if (result.status === "refused" || result.status === "failed") {
      setBusy(false);
      setProblem({ tone: "error", lines: [said.text, "Nothing was changed."] });
      return;
    }
    const lines = [`${inv.num || "Invoice"} is paid. ${said.text}`];
    let tone: Notice["tone"] = said.tone;
    if (receipt && email) {
      try {
        const sent = await stockistReceiptApi.send({ to: email, stockistName: s.name, invoiceNum: inv.num, amount, paidOn: today() });
        lines.push(`Receipt emailed to ${sent.to}.`);
      } catch (error) {
        tone = "warn";
        lines.push(`The receipt wasn't sent: ${error instanceof Error ? error.message : "try again later"}. The payment is still saved.`);
      }
    }
    onSaved(inv.bookId, result.state as Record<string, any>, { tone, lines });
  };
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title={`Mark ${inv.num || "invoice"} paid`}
      description={`${amount} from ${s.name}`}
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><InkButton onClick={pay} busy={busy} disabled={busy}>{busy ? "Saving…" : "Mark paid"}</InkButton></>}>
      <div className="rp-sk-detail">
        <p className="rp-sk-meta">{w("Clears its sales from what they owe. Paid in another currency? Use the stockroom, which asks for the rate.")}</p>
        {email ? <Checkbox label={`Email ${email} a receipt`} checked={receipt} onChange={(e) => setReceipt(e.target.checked)} disabled={busy} />
          : <p className="rp-sk-meta">No email on file, so no receipt.</p>}
        {problem && <NoticeLine notice={problem} />}
      </div>
    </Dialog>
  );
}

export function StockistsList({ view, onSaved, onNewInvoice }: { view: StockistsView; onSaved?: (bookId: string, state: Record<string, any>) => void; onNewInvoice?: (stockist: string) => void }) {
  const w = useShopWords();
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<StockistInvoice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const current = view.stockists.find((s) => s.key === open) || null;
  // Only states that ask for something get a chip; settled and holding shops read plainly, as in the mockup.
  const flagged = (s: Stockist) => s.state === "overdue" || s.state === "mismatch" || s.state === "owes";
  const columns: Column<Stockist>[] = [
    { key: "shop", header: "Shop", lead: true, render: (s) => <>
      <button type="button" className="rp-sr-open" onClick={() => setOpen(s.key)} aria-label={`Open ${s.name}: balance, invoices and ledger`}>{s.name}</button>
      {flagged(s) && <> <StatusBadge glyph={false} tone={STATE_BADGE[s.state].tone}>{STATE_BADGE[s.state].words}</StatusBadge></>}
      <div className="rp-hint">{[where(s), `${s.rate}% commission`].filter(Boolean).join(" · ")}</div>
    </> },
    { key: "copies", header: w("Copies"), numeric: true, render: (s) => s.onShelf },
    { key: "sold", header: "Sold", numeric: true, render: (s) => s.sold },
    { key: "owed", header: "Owed", numeric: true, render: (s) => s.owed.length ? moneyText(s.owed) : "—" },
  ];
  return (
    <div className="rp-sk">
      {view.stockists.length ? (
        <section className="rp-card rp-reorder-card" aria-labelledby="rp-sk-title">
          <h2 className="rp-card-title" id="rp-sk-title">Stockists</h2>
          <DataTable caption="Stockists" columns={columns} rows={view.stockists} rowKey={(s) => s.key} stackOnPhone onRowClick={(s) => setOpen(s.key)} />
        </section>
      ) : <EmptyState inline icon="🏪" title="No stockists yet" description={w("Shops that hold your books on consignment appear here, with what they owe you. Add them in the stockroom's consignment records.")} />}
      {view.overdueCount > 0 && (
        <p className="rp-sr-status" role="status">{view.overdueCount === 1 ? "1 invoice is" : `${view.overdueCount} invoices are`} overdue: {moneyText(view.overdueTotals)}.</p>
      )}
      <Drawer open={!!current} onClose={() => { setOpen(null); setNotice(null); }} title={current?.name || ""} description={onSaved ? "Bill them, or mark their invoices paid." : "Read-only."}>
        {current && <Detail s={current} notice={notice} onPay={onSaved ? (i) => { setNotice(null); setPaying(i); } : undefined}
          onNewInvoice={onSaved && onNewInvoice ? () => { const name = current.name; setOpen(null); setNotice(null); onNewInvoice(name); } : undefined} />}
      </Drawer>
      {current && paying && onSaved && (
        <PayDialog s={current} inv={paying} onClose={() => setPaying(null)}
          onSaved={(bookId, state, n) => { onSaved(bookId, state); setNotice(n); setPaying(null); }} />
      )}
    </div>
  );
}

export function StockistsPage({ load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="stockists" load={load}>{(records) => <StockistsBoard initial={records} />}</RecordsGate>;
}

/** Keeps the records on screen and swaps in a book's saved state (other devices' rows included, WRITING.md rule 5). */
function StockistsBoard({ initial }: { initial: StockroomRecords }) {
  const [records, setRecords] = useState(initial);
  const [newFor, setNewFor] = useState<string | null>(null);
  const view = useMemo(() => buildStockists(records), [records]);
  const saved = (bookId: string, state: Record<string, any>) => setRecords((r) => ({ ...r, states: { ...r.states, [bookId]: state } }));
  return (
    <div className="rp-sk">
      <StockistsList view={view} onSaved={saved} onNewInvoice={setNewFor} />
      <InvoicesCard records={records} onBookSaved={saved} onSettingsSaved={(value) => setRecords((r) => ({ ...r, invoiceSettings: value }))}
        newFor={newFor} onNewDone={() => setNewFor(null)} />
    </div>
  );
}
