// Stockroom › Stockists › Invoices: the list of every invoice, the invoice details (name, address, terms, bank), and
// making, editing, sending, deleting and printing an invoice. Rules and saves are in invoiceMake.ts, the printed page in
// invoicePaper.ts. Every save goes through stockroomWrite.ts and its result is always shown (WRITING.md).
import { US_SHOP } from "../moneySign";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { DataTable, Dialog, EmptyState, IconButton, PageActions, PageHead, PrimaryButton, Tabs, SecondaryButton, StatusBadge, TextArea, TextField, useConfirm, type Column } from "../riso/components";
import { FormChoice, FormField, FormPage, FormReadOnly, FormRow, FormSection, FormToggle, StatusBar, SummaryRail, formStatus } from "../riso/FormKit";
import { useShopWords } from "../shopWords";
import { invoiceReminderState } from "@stockroom/payment-reminders.js";
import { logReminder, promiseUntil, reminderMail, remindQuestion, remindRefusal } from "./invoiceRemind";
import { stockistReceiptApi } from "./stockistReceipt";
import { shopProfile } from "../../../lib/shopProfile";
import { shopNameFromSettings } from "../../../shared/shopIdentity";
import { adminApi } from "../api";
import {
  blankForm, blankLine, cleanInvoiceSettings, copyForm, invoiceEmail, deleteInvoiceChange, formBookIds, formFromInvoice, formTotals, INVOICE_SETTINGS_KEY, invoiceList,
  invoiceProblem, invoiceSettingsChange, currencyFor, markSentChange, newInvoiceId, nextNumber, ownerChoices, pendingSaleLines, saveInvoiceChange,
  stockistNames, todayText, INVOICE_FILTERS, inFilter, invoicesSummary, type InvoiceFilter, type InvoiceForm, type InvoiceLine, type InvoiceRow, type InvoiceSettings,
} from "./invoiceMake";
import { invoicePage, printInvoice } from "./invoicePaper";
import { deleteQuoteChange, newQuoteId, quoteProblem, saveQuoteChange } from "./quoteMake";
import { blankSchedule, deleteRepeatChange, EVERY_CHOICES, everyWord, newRepeatId, repeatFromInvoice, saveRepeatChange, scheduleProblem, type Every, type Schedule } from "./recurringInvoices";
import { attachCardLinkChange, cardLinkOf, cardLinkRefusal, closeStaleCardLinks, invoiceCardPayApi, recordCardPayments, strayPaymentLine } from "./invoiceCardPay";
import { RemindersDialog } from "./RemindersDialog";
import { markInvoicePaid, moneyText } from "./stockists";
import { LetterheadDialog } from "./LetterheadDialog";
import type { StockroomRecords } from "./stockroomData";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Rec = Record<string, any>;
export type InvoiceNotice = { tone: "ok" | "warn" | "error"; lines: string[] };
type BookSaved = (bookId: string, state: Rec, notice: InvoiceNotice) => void;

/** The settings as the invoices use them (the shop's own name when none was saved). */
export const invoiceSettingsOf = (records: StockroomRecords, shopName = "") => cleanInvoiceSettings(records.invoiceSettings, shopName || shopProfile.name || "");

/** The shop's name (Settings › General, or the site name), for an invoice whose details name none yet. */
function useShopName() {
  const [name, setName] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve(adminApi.getPublicSettings?.()).then((s) => { if (live) setName(shopNameFromSettings(s)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return name;
}

/** The shop's name for pages beside Invoices (Quotes, Repeating) that print with the same details. */
export const useShopNameForInvoices = useShopName;

function Note({ notice }: { notice: InvoiceNotice }) {
  return <div className="rp-sk-notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.lines.map((l) => <p key={l}>{l}</p>)}</div>;
}

/** One book save: the result in plain words, or the refusal. Never throws. */
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

// ── Invoice details ────────────────────────────────────────────────────────────────────────────────────────────────

export function InvoiceSettingsDialog({ settings, onClose, onSaved }: { settings: InvoiceSettings; onClose: () => void; onSaved: (value: Rec, notice: InvoiceNotice) => void }) {
  const w = useShopWords();
  const [form, setForm] = useState<InvoiceSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<InvoiceNotice | null>(null);
  const set = (k: keyof InvoiceSettings) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (busy) return;
    setBusy(true); setProblem(null);
    try {
      const result = await stockroomWriteApi.updateSetting(INVOICE_SETTINGS_KEY, invoiceSettingsChange(form));
      const said = describeResult(result);
      if (result.status === "refused" || result.status === "failed") { setProblem({ tone: "error", lines: [said.text, "Nothing was changed."] }); setBusy(false); return; }
      onSaved((result.value as Rec) || {}, { tone: said.tone, lines: said.tone === "ok" ? ["Invoice details saved. Every invoice prints with them."] : [said.text] });
    } catch (error) {
      setProblem({ tone: "error", lines: [error instanceof Error ? error.message : "That didn't save.", "Nothing was changed."] });
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title="Invoice details" description="What prints on every invoice. Saved with your records, so every device uses them."
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={save} busy={busy}>{busy ? "Saving…" : "Save details"}</PrimaryButton></>}>
      <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Business name" value={form.name} onChange={set("name")} />
        <TextArea label="Address" rows={3} value={form.addr} onChange={set("addr")} />
        <div className="rp-money-form-row">
          <TextField label="Email" type="email" value={form.email} onChange={set("email")} />
          <TextField label="Website" value={form.web} onChange={set("web")} />
        </div>
        <TextField label="Tax number (optional)" hint={US_SHOP ? "Their tax ID or VAT number." : "GST/HST or VAT number."} value={form.vat} onChange={set("vat")} />
        <TextField label="Usual terms" hint="Filled in on each new invoice." value={form.terms} onChange={set("terms")} />
        <TextArea label="Bank transfer details (optional)" rows={3} value={form.bank} onChange={set("bank")} />
        <TextField label="Thank-you line" placeholder={w("Thank you for stocking our books.")} value={form.footer} onChange={set("footer")} />
        {problem && <Note notice={problem} />}
      </form>
    </Dialog>
  );
}

// ── Making and editing ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One editor for the three money documents that share an invoice's shape: an invoice, a quote (quoteMake.ts: `dueDate`
 * is the valid-until day, saved into `quotes`) and a repeating invoice (recurringInvoices.ts: `date` is the next
 * invoice's day, plus the schedule; saved into `recurringInvoices`).
 */
export type DocKind = "invoice" | "quote" | "repeat";
const DOC_WORD: Record<DocKind, string> = { invoice: "invoice", quote: "quote", repeat: "repeating invoice" };
const DOC_BACK: Record<DocKind, string> = { invoice: "Invoices", quote: "Quotes", repeat: "Repeating" };

export function InvoiceEditor({ records, settings, start, onClose, onSaved, onDeleted, kind = "invoice", startSchedule }: {
  records: StockroomRecords; settings: InvoiceSettings; start: InvoiceForm; onClose: () => void; onSaved: BookSaved; onDeleted?: BookSaved;
  kind?: DocKind; startSchedule?: Schedule;
}) {
  const w = useShopWords();
  const word = DOC_WORD[kind];
  const Word = word[0].toUpperCase() + word.slice(1);
  const [schedule, setSchedule] = useState<Schedule>(startSchedule || blankSchedule());
  const [form, setForm] = useState<InvoiceForm>(start);
  const [startText] = useState(() => JSON.stringify(start));
  // New invoices are saved as sent unless this is turned off (then they stay a draft).
  const [markSent, setMarkSent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<InvoiceNotice | null>(null);
  const [ask, confirmNode] = useConfirm();
  // One id per new invoice, fixed before the first try, so a retry after a failed save can't file it twice.
  const id = useRef(kind === "quote" ? newQuoteId(Date.now()) : kind === "repeat" ? newRepeatId(Date.now()) : newInvoiceId(Date.now()));
  const names = useMemo(() => stockistNames(records), [records]);
  const owners = ownerChoices(records, form);
  const totals = formTotals(form);
  const code = form.currencyCode;

  // A number the admin put there follows the titles billed (several titles get the press's initials); a typed one stays.
  const renumber = (f: InvoiceForm): InvoiceForm => {
    if (kind !== "invoice" || f.editingId || !f.ownerBookId || f.num !== f.autoNum) return f;
    const num = nextNumber(records, f.ownerBookId, formBookIds(f, records.books), settings.name, new Date().getFullYear());
    return { ...f, num, autoNum: num };
  };
  const set = (patch: Partial<InvoiceForm>) => { setNote(null); setForm((f) => renumber({ ...f, ...patch })); };
  const pickWho = (billTo: InvoiceForm["billTo"], stockist: string) => {
    setNote(null);
    setForm((f) => {
      const next = { ...f, billTo, stockist };
      const choices = ownerChoices(records, next);
      const ownerBookId = f.editingId ? f.ownerBookId : choices.some((b) => b.id === f.ownerBookId) ? f.ownerBookId : choices[0]?.id || f.ownerBookId;
      return renumber({ ...next, ownerBookId, currencyCode: f.editingId ? f.currencyCode : currencyFor(records, ownerBookId) });
    });
  };
  const setLine = (i: number, patch: Partial<InvoiceLine>) => set({ items: form.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const bringInSales = () => {
    const { lines, skipped } = pendingSaleLines(records, form);
    const kept = form.items.filter((it) => it.description.trim() || it.unitPrice.trim());
    const known = new Set(kept.map((it) => String(it.ledgerId)));
    const fresh = lines.filter((l) => !known.has(String(l.ledgerId)));
    if (fresh.length) set({ items: [...kept, ...fresh] });
    setNote({ tone: fresh.length ? "ok" : "warn", lines: [
      fresh.length ? `Added ${fresh.length} unpaid ${fresh.length === 1 ? "sale" : "sales"}.` : "No unpaid sales to add for this stockist under this title.",
      ...(skipped ? [`${skipped} ${skipped === 1 ? "sale is" : "sales are"} already on another invoice, so left out.`] : []),
    ] });
  };

  const save = async (status: "draft" | "sent") => {
    if (busy) return;
    const problem = (kind === "quote" ? quoteProblem(invoiceProblem(form, records)) : invoiceProblem(form, records))
      || (kind === "repeat" ? scheduleProblem(form, schedule, todayText()) : null);
    if (problem) { setNote({ tone: "error", lines: [problem] }); return; }
    setBusy(true); setNote(null);
    const ctx = { books: records.books, id: id.current, now: Date.now() };
    const change = kind === "quote" ? saveQuoteChange(form, status, ctx) : kind === "repeat" ? saveRepeatChange(form, schedule, ctx) : saveInvoiceChange(form, status, ctx);
    const done = kind === "repeat"
      ? (form.editingId ? "Repeating invoice saved." : `Repeating invoice set up. The first one is made on ${fmtD(form.date)}.`)
      : `${form.num || Word} ${form.editingId ? "saved" : status === "draft" ? "saved as a draft" : "saved"}.`;
    const r = await saveBook(form.ownerBookId, change, done);
    if (!r.ok) { setNote(r.notice); setBusy(false); return; }
    onSaved(form.ownerBookId, r.state, r.notice);
  };
  const remove = async () => {
    if (busy || !form.editingId) return;
    const message = kind === "invoice" ? "Its sales go back to unbilled. This can't be undone." : kind === "repeat" ? "No more invoices are made from it. Invoices it already made stay." : "This can't be undone.";
    if (!(await ask({ title: `Delete ${form.num || `this ${word}`}?`, message, confirmLabel: `Delete ${word}` }))) return;
    setBusy(true);
    const change = kind === "quote" ? deleteQuoteChange(form.editingId) : kind === "repeat" ? deleteRepeatChange(form.editingId) : deleteInvoiceChange(form.editingId);
    const r = await saveBook(form.ownerBookId, change, `${form.num || Word} deleted.`);
    if (!r.ok) { setNote(r.notice); setBusy(false); return; }
    (onDeleted || onSaved)(form.ownerBookId, r.state, r.notice);
  };

  // v4 New invoice page (mockup 1c): Who it's for · Items · Note and sending, the total in a white rail, one status bar.
  const editingSent = !!form.editingId && form.status !== "draft";
  const canDelete = !!form.editingId && form.status !== "paid" && form.status !== "accepted";
  const person = form.billTo === "person";
  const whoMissing = person ? !form.person.name.trim() : !form.stockist;
  const linesMissing = !form.items.some((it) => it.description.trim());
  const missing = [whoMissing, linesMissing].filter(Boolean).length;
  const dirty = JSON.stringify(form) !== startText;
  const status = formStatus({ missing, create: !form.editingId, verb: "create", dirty });
  const lineTotal = (it: InvoiceLine) => formTotals({ ...form, items: [it], discountType: "percent", discountValue: "", taxRate: "" }).subtotal;
  const dueIn = daysFrom(form.date, form.dueDate);
  const railRows = [
    ...form.items.filter((it) => it.description.trim()).map((it) => ({ label: `${it.description.trim()} × ${it.qty || 0}`, value: fmt(lineTotal(it), code) })),
    ...(totals.discount > 0 ? [{ label: "Discount", value: `−${fmt(totals.discount, code)}` }] : []),
    ...(totals.tax > 0 ? [{ label: "Tax", value: fmt(totals.tax, code) }] : []),
    { label: "Total", value: fmt(totals.total, code) },
  ];
  const primary = form.editingId ? "Save changes" : kind === "repeat" ? "Set it up" : `Create ${word}`;
  const send = () => void save(kind === "repeat" ? "draft" : editingSent || (!form.editingId ? markSent : form.status !== "draft") ? "sent" : "draft");
  const dueChoices = kind === "quote" ? VALID_CHOICES : DUE_CHOICES;
  const filedUnder = (
    <FormField label={w("Filed under")} hint={w("The title whose records keep this invoice.")}>
      {(a) => <select {...a} value={form.ownerBookId} disabled={!!form.editingId} onChange={(e) => set({ ownerBookId: e.target.value, currencyCode: currencyFor(records, e.target.value) })}>
        {owners.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>}
    </FormField>
  );
  const personField = (key: keyof InvoiceForm["person"], label: string, type = "text") => (
    <FormField label={label}>{(a) => <input {...a} type={type} value={form.person[key]} onChange={(e) => set({ person: { ...form.person, [key]: e.target.value } })} />}</FormField>
  );

  return (
    <>
      <PageHead title={form.editingId ? `Edit ${form.num || word}` : `New ${word}`} back={{ label: DOC_BACK[kind], onClick: onClose }}
        description={form.status === "paid" ? "Paid. Fixing a detail keeps it paid."
          : kind === "repeat" ? "Made and sent for you on a schedule. Each one is a normal invoice."
            : `${form.num || Word} · for a stockist or anyone you type in`} />
      <form onSubmit={(e) => { e.preventDefault(); if (!missing) send(); }}>
        <FormPage rail={
          <SummaryRail tone="white" title={kind === "repeat" ? `${everyWord(schedule.every)} invoice` : `${Word} ${form.num || ""}`.trim()} value={fmt(totals.total, code)}
            sub={kind === "repeat" ? (form.date ? `Next on ${fmtD(form.date)}` : "Pick the next day")
              : kind === "quote" ? (form.dueDate ? `Good until ${fmtD(form.dueDate)}` : "No end date")
                : form.dueDate ? (dueIn != null && dueIn >= 0 ? `Due in ${dueIn} ${dueIn === 1 ? "day" : "days"}` : `Due ${fmtD(form.dueDate)}`) : "No due date"}
            rows={railRows} note="Uses your invoice details and letterhead." />
        }>
          <FormSection title="Who it’s for" description="Pick a stockist or type a name.">
            {form.editingId
              ? <FormReadOnly label="Billed to" value={person ? form.person.name || "—" : form.stockist} />
              : <FormChoice label="Bill" value={form.billTo} onChange={(mode) => pickWho(mode, mode === "store" ? form.stockist || names[0] || "" : "")}
                  options={[{ value: "store", label: "A stockist" }, { value: "person", label: "Someone else" }]} />}
            {!person && !form.editingId && (
              <FormRow>
                <FormField label="Stockist" required empty={!form.stockist}>
                  {(a) => <select {...a} value={form.stockist} onChange={(e) => pickWho("store", e.target.value)}>
                    {!names.length && <option value="">No stockists yet</option>}
                    {names.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>}
                </FormField>
                {filedUnder}
              </FormRow>
            )}
            {person && (
              <>
                <FormRow>
                  <FormField label="Customer" required empty={!form.person.name.trim()}>{(a) => <input {...a} value={form.person.name} onChange={(e) => set({ person: { ...form.person, name: e.target.value } })} />}</FormField>
                  {personField("email", "Email", "email")}
                </FormRow>
                {personField("address", "Address")}
                <FormRow>{personField("city", "City")}{personField("region", "Province or region")}</FormRow>
                <FormRow>{personField("postal", "Postal code")}{personField("country", "Country")}</FormRow>
                {filedUnder}
              </>
            )}
            {!person && form.editingId && filedUnder}
            {kind !== "repeat" && <FormField label={`${Word} number`}>{(a) => <input {...a} value={form.num} onChange={(e) => set({ num: e.target.value })} style={{ fontFamily: "var(--rp-font-mono)" }} />}</FormField>}
            {kind === "repeat" ? <>
              <FormChoice label="How often" value={schedule.every} onChange={(v) => setSchedule((s) => ({ ...s, every: v as Every }))} options={EVERY_CHOICES} />
              <FormRow>
                <FormField label={form.editingId ? "Next invoice on" : "First invoice on"}>{(a) => <input {...a} type="date" value={form.date} onChange={(e) => set({ date: e.target.value, dueDate: plusDays(e.target.value, dueIn ?? 30) })} />}</FormField>
                <FormField label="Last invoice on" hint="Optional. Leave blank to keep going.">{(a) => <input {...a} type="date" value={schedule.endDate} onChange={(e) => setSchedule((s) => ({ ...s, endDate: e.target.value }))} />}</FormField>
              </FormRow>
              <FormChoice label="Payment due" value={(DUE_CHOICES.find((n) => n === dueIn) ?? "") + ""} onChange={(v) => set({ dueDate: plusDays(form.date || todayText(), Number(v)) })}
                options={DUE_CHOICES.map((n) => ({ value: String(n), label: `${n} days after` }))} />
            </> : <>
              <FormRow>
                <FormField label={kind === "quote" ? "Date" : "Issued"}>{(a) => <input {...a} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />}</FormField>
                <FormField label={kind === "quote" ? "Valid until" : "Due"}>{(a) => <input {...a} type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />}</FormField>
              </FormRow>
              <FormChoice label={kind === "quote" ? "Good for" : "Due in"} value={(dueChoices.find((n) => n === dueIn) ?? "") + ""} onChange={(v) => set({ dueDate: plusDays(form.date || todayText(), Number(v)) })}
                options={dueChoices.map((n) => ({ value: String(n), label: `${n} days` }))} />
            </>}
          </FormSection>

          <FormSection title="Items" description="Add what they bought. Totals update as you type.">
            <div className="rp-fk-lines" role="group" aria-label="Lines">
              <div className="rp-fk-lines-head" aria-hidden><span>Item</span><span>Qty</span><span>Price</span><span>Off %</span><span>Total</span><span /></div>
              {form.items.map((it, i) => (
                <div key={i} className="rp-fk-line" data-missing={i === 0 && linesMissing ? "" : undefined}>
                  <input aria-label={`Line ${i + 1} item`} placeholder="Item" value={it.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" placeholder="0" value={it.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                  <input aria-label={`Line ${i + 1} price`} inputMode="decimal" placeholder="0.00" value={it.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                  <input aria-label={`Line ${i + 1} discount percent`} inputMode="decimal" placeholder="0" value={it.discountPct} onChange={(e) => setLine(i, { discountPct: e.target.value })} />
                  <span className="rp-fk-line-total">{fmt(lineTotal(it), code)}</span>
                  <IconButton label={`Remove line ${i + 1}`} type="button" disabled={form.items.length === 1} onClick={() => set({ items: form.items.filter((_, j) => j !== i) })}>×</IconButton>
                </div>
              ))}
            </div>
            <div className="rp-fk-row" style={{ flex: "0 0 auto" }}>
              <button type="button" className="rp-fk-pill" style={{ flex: "0 0 auto" }} onClick={() => set({ items: [...form.items, blankLine()] })}>Add a line</button>
              {!person && kind === "invoice" && <button type="button" className="rp-fk-pill" style={{ flex: "0 0 auto" }} onClick={bringInSales}>Add unpaid sales</button>}
            </div>
            <FormChoice label="Discount on the whole invoice" value={form.discountType} onChange={(v) => set({ discountType: v })} options={[{ value: "percent", label: "Percent" }, { value: "flat", label: "Amount" }]} />
            <FormRow>
              <FormField label="Discount" suffix={form.discountType === "percent" ? "%" : undefined} prefix={form.discountType === "flat" ? code : undefined}>{(a) => <input {...a} inputMode="decimal" placeholder="0" value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />}</FormField>
              <FormField label="Tax" suffix="%">{(a) => <input {...a} inputMode="decimal" placeholder="0" value={form.taxRate} onChange={(e) => set({ taxRate: e.target.value })} />}</FormField>
            </FormRow>
          </FormSection>

          <FormSection title="Note and sending" description={`Shown at the bottom of the ${kind === "quote" ? "quote" : "invoice"}.`}>
            <FormField label="Note">{(a) => <textarea {...a} rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}</FormField>
            {kind !== "quote" && <FormField label="Payment link or e-Transfer email" hint="Optional.">{(a) => <input {...a} value={form.paymentLink} onChange={(e) => set({ paymentLink: e.target.value })} />}</FormField>}
            <FormField label="Terms">{(a) => <input {...a} value={form.terms} onChange={(e) => set({ terms: e.target.value })} />}</FormField>
            {kind === "repeat"
              ? <FormToggle label="Email it for me" hint="Off: each one waits as a draft for you to send." checked={schedule.autoEmail} onChange={(on) => setSchedule((s) => ({ ...s, autoEmail: on }))} />
              : !form.editingId && <FormToggle label="Mark it as sent" hint="Otherwise it stays as a draft." checked={markSent} onChange={setMarkSent} />}
            {canDelete && <button type="button" className="rp-fk-pill" data-tone="danger" style={{ alignSelf: "flex-start" }} onClick={remove} disabled={busy}>Delete {word}</button>}
          </FormSection>
        </FormPage>
        {note && <Note notice={note} />}
        <StatusBar status={status} primaryLabel={primary} busy={busy} blocked={missing > 0}
          onBlocked={() => setNote({ tone: "warn", lines: ["Fill in the highlighted fields."] })}
          onPrimary={send} onCancel={onClose} cancelLabel={form.editingId ? "Discard" : "Cancel"} />
      </form>
      {confirmNode}
    </>
  );
}

const DUE_CHOICES = [7, 14, 30];
const VALID_CHOICES = [14, 30, 60];
const dayMs = 86_400_000;
const dayNum = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : NaN);
/** Whole days from one shop day to another, or null. */
const daysFrom = (from: string, to: string) => { const n = (dayNum(to) - dayNum(from)) / dayMs; return Number.isFinite(n) ? Math.round(n) : null; };
/** The shop day `n` days after `from`. */
const plusDays = (from: string, n: number) => new Date(dayNum(from) + n * dayMs).toISOString().slice(0, 10);

// ── One invoice: the printed page, with its actions ───────────────────────────────────────────────────────────────

export function InvoiceView({ row, settings, onClose, onEdit, onCopy, onRepeat, onSaved }: {
  row: InvoiceRow; settings: InvoiceSettings; onClose: () => void; onEdit: () => void; onCopy?: () => void; onRepeat?: () => void; onSaved: BookSaved;
}) {
  const mail = invoiceEmail(row.inv, settings, row.code);
  const mailto = `mailto:${encodeURIComponent(mail.to)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<InvoiceNotice | null>(null);
  const today = todayText();
  const [ask, confirmNode] = useConfirm();
  const chase = invoiceReminderState(row.inv);
  const [promise, setPromise] = useState(String(row.inv.remindAfter || ""));
  const remind = async () => {
    if (busy) return;
    const refused = remindRefusal(row.inv);
    if (refused) { setNote({ tone: "warn", lines: [refused] }); return; }
    if (!(await ask({ title: "Remind this customer", message: remindQuestion(row.inv, today), confirmLabel: "Send reminder" }))) return;
    setBusy(true);
    const to = String(row.inv.storeEmail).trim();
    const m = reminderMail(row.inv, settings, row.code);
    let sentOk = true, error = "";
    try { await stockistReceiptApi.sendNote({ to, subject: m.subject, text: m.text }); }
    catch (e) { sentOk = false; error = e instanceof Error ? e.message : "send failed"; }
    const r = await saveBook(row.ownerBookId, logReminder(row.id, { at: Date.now(), to, status: sentOk ? "sent" : "failed", error: error.slice(0, 200) }),
      sentOk ? `Reminder sent to ${to}.` : `The reminder wasn't sent: ${error}`);
    setBusy(false);
    if (!r.ok) { setNote(sentOk ? { tone: "warn", lines: [`Reminder sent to ${to}, but it couldn't be noted on the invoice.`, ...r.notice.lines] } : r.notice); return; }
    if (!sentOk) { setNote({ tone: "error", lines: [`The reminder wasn't sent: ${error}`] }); return; }
    onSaved(row.ownerBookId, r.state, r.notice);
  };
  const savePromise = async () => {
    if (busy) return;
    setBusy(true);
    const r = await saveBook(row.ownerBookId, promiseUntil(row.id, promise), promise ? `No reminder for ${row.num} before ${fmtD(promise)}.` : `${row.num} can be chased again.`);
    setBusy(false);
    if (!r.ok) { setNote(r.notice); return; }
    onSaved(row.ownerBookId, r.state, r.notice);
  };
  const cardLink = cardLinkOf(row.inv);
  const makeCardLink = async () => {
    if (busy) return;
    const refused = cardLinkRefusal(row.inv);
    if (refused) { setNote({ tone: "warn", lines: [refused] }); return; }
    setBusy(true);
    let made: { url: string; token: string };
    try {
      made = await invoiceCardPayApi.make({ ref: `${row.ownerBookId}:${row.id}`.slice(0, 160), kind: "invoice", label: `Invoice ${row.num || ""}`.trim(), amount: row.total, currency: row.code, email: String(row.inv.storeEmail || "") });
    } catch (e) {
      setBusy(false);
      setNote({ tone: "error", lines: [e instanceof Error ? e.message : "The card link couldn't be made."] });
      return;
    }
    const r = await saveBook(row.ownerBookId, attachCardLinkChange(row.id, made, Date.now()), `Card pay link ready for ${row.num || "this invoice"}. It's on the invoice, the email and the reminders.`);
    setBusy(false);
    if (!r.ok) { setNote(r.notice); return; }
    navigator.clipboard?.writeText(made.url).catch(() => undefined);
    onSaved(row.ownerBookId, r.state, r.notice);
  };
  const send = async () => {
    if (busy) return;
    setBusy(true);
    const r = await saveBook(row.ownerBookId, markSentChange(row.id, Date.now()), `${row.num || "Invoice"} is marked sent. It counts as owed from now.`);
    setBusy(false);
    if (!r.ok) { setNote(r.notice); return; }
    onSaved(row.ownerBookId, r.state, r.notice);
  };
  return (
    <Dialog open size="lg" onClose={busy ? () => undefined : onClose} title={row.num || "Invoice"} description={`${row.billedTo} · ${fmt(row.total, row.code)}`}
      footer={<>
        <SecondaryButton onClick={onEdit} disabled={busy}>Edit</SecondaryButton>
        {onCopy && <SecondaryButton onClick={onCopy} disabled={busy}>Duplicate</SecondaryButton>}
        {onRepeat && !row.inv.repeat && <SecondaryButton onClick={onRepeat} disabled={busy}>Repeat it</SecondaryButton>}
        <SecondaryButton onClick={() => { window.location.href = mailto; }} disabled={busy}>{mail.to ? "Email" : "Email (no address on file)"}</SecondaryButton>
        {row.status === "sent" && <SecondaryButton onClick={remind} disabled={busy}>{chase.count ? "Remind again" : "Remind"}</SecondaryButton>}
        {row.status === "draft" && <SecondaryButton onClick={send} busy={busy}>{busy ? "Saving…" : "Mark sent"}</SecondaryButton>}
        {(row.status === "sent" || row.status === "draft") && (cardLink
          ? <SecondaryButton onClick={() => { navigator.clipboard?.writeText(cardLink.url).then(() => setNote({ tone: "ok", lines: ["Card pay link copied."] }), () => setNote({ tone: "ok", lines: [cardLink.url] })); }} disabled={busy}>Copy card link</SecondaryButton>
          : <SecondaryButton onClick={makeCardLink} disabled={busy}>Card pay link</SecondaryButton>)}
        {row.status === "sent" && row.inv.dueDate && String(row.inv.dueDate) < today && <SecondaryButton onClick={() => printInvoice(row.inv, settings, today, { reminder: true })} disabled={busy}>Reminder PDF</SecondaryButton>}
        <PrimaryButton onClick={() => printInvoice(row.inv, settings, today)} disabled={busy}>Print or save PDF</PrimaryButton>
      </>}>
      {note && <Note notice={note} />}
      {row.status === "sent" && (
        <div className="rp-inv-head">
          <p className="rp-hint">{chase.count ? `Reminded ${chase.count === 1 ? "once" : `${chase.count} times`}${chase.lastAt ? `, last ${fmtD(new Date(chase.lastAt).toLocaleDateString("en-CA"))}` : ""}.` : "Not reminded yet."}{chase.lastStatus === "failed" ? " The last reminder didn't go out." : ""}</p>
          <TextField label="Promised to pay by" hint="No reminder before this date" type="date" value={promise} onChange={(e) => setPromise(e.target.value)} />
          {promise !== String(row.inv.remindAfter || "") && <SecondaryButton size="sm" onClick={savePromise} disabled={busy}>Save date</SecondaryButton>}
        </div>
      )}
      {confirmNode}
      <iframe className="rp-inv-paper" title={`Invoice ${row.num}`} srcDoc={invoicePage(row.inv, settings, today)} />
    </Dialog>
  );
}

// ── The list ─────────────────────────────────────────────────────────────────────────────────────────────────────

const statusBadge = (r: InvoiceRow) => r.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge>
  : <StatusBadge tone={r.status === "paid" ? "success" : r.status === "sent" ? "info" : "neutral"} glyph={false}>{r.status[0].toUpperCase() + r.status.slice(1)}</StatusBadge>;

type Open = { kind: "settings" } | { kind: "reminders" } | { kind: "letterhead" } | { kind: "edit"; form: InvoiceForm } | { kind: "view"; id: string }
  | { kind: "repeat"; form: InvoiceForm; schedule: Schedule };

/** The Invoices card on Stockists: every invoice (to stockists and to people), and the ways in. */
export function InvoicesCard({ records, onBookSaved, onSettingsSaved, newFor, onNewDone }: {
  records: StockroomRecords; onBookSaved?: (bookId: string, state: Rec) => void; onSettingsSaved?: (value: Rec) => void;
  /** A stockist to start a new invoice for (from its drawer). */ newFor?: string | null; onNewDone?: () => void;
}) {
  const w = useShopWords();
  const shopName = useShopName();
  const settings = invoiceSettingsOf(records, shopName);
  const rows = useMemo(() => invoiceList(records), [records]);
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<InvoiceNotice | null>(null);
  const [shown, setShown] = useState(10);
  const writable = !!onBookSaved;
  useEffect(() => {
    if (!newFor || !writable) return;
    setNotice(null);
    setOpen({ kind: "edit", form: blankForm(records, settings, { stockist: newFor }) });
    onNewDone?.();
  }, [newFor]);
  // Card pay links paid since the last visit: marked paid here (the server never writes the stockroom).
  useEffect(() => {
    if (!writable) return;
    let cancelled = false;
    const deps = {
      save: async (bookId: string, change: (s: Rec) => Rec) => { const r = await stockroomWriteApi.saveBookState(bookId, change); return r.status === "saved" || r.status === "unchanged" ? { ok: true, state: r.state as Rec } : { ok: false }; },
      onSaved: (bookId: string, state: Rec) => { if (!cancelled) onBookSaved?.(bookId, state); },
    };
    recordCardPayments(records, deps).then(async (ids) => {
      // Links of invoices that changed, were deleted or were paid another way stop taking money here.
      const strays = await closeStaleCardLinks(records, deps);
      if (cancelled) return;
      if (strays.length) setNotice({ tone: "error", lines: strays.map(strayPaymentLine) });
      else if (ids.length) setNotice({ tone: "ok", lines: [`${ids.length === 1 ? "One invoice was" : `${ids.length} invoices were`} paid by card and marked paid.`] });
    });
    return () => { cancelled = true; };
  }, [writable]);
  const current = open?.kind === "view" ? rows.find((r) => r.id === open.id) || null : null;
  const saved: BookSaved = (bookId, state, n) => { onBookSaved?.(bookId, state); setNotice(n); setOpen(null); };

  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [acting, setActing] = useState<string | null>(null);
  const [ask, confirmNode] = useConfirm();
  const summary = useMemo(() => invoicesSummary(rows), [rows]);
  const listed = rows.filter((r) => inFilter(r, filter));
  const openRow = (r: InvoiceRow) => { setNotice(null); setOpen({ kind: "view", id: r.id }); };
  // v4: one action per row, through the same saves as the invoice's own buttons (Mark sent; Mark paid as Stockists' Settle).
  const act = async (r: InvoiceRow, paid: boolean) => {
    if (acting || !writable) return;
    const name = r.num || "Invoice";
    if (paid && !(await ask({ title: `Mark ${name} paid`, message: `${fmt(r.total, r.code)} from ${r.billedTo}.`, confirmLabel: "Mark paid" }))) return;
    setActing(r.id); setNotice(null);
    const res = await saveBook(r.ownerBookId, paid ? markInvoicePaid(r.id, Date.now()) : markSentChange(r.id, Date.now()),
      paid ? `${name} is paid.` : `${name} is marked sent. It counts as owed from now.`);
    setActing(null);
    if (!res.ok) { setNotice(res.notice); return; }
    onBookSaved?.(r.ownerBookId, res.state); setNotice(res.notice);
  };
  const columns: Column<InvoiceRow>[] = [
    { key: "num", header: "Invoice", lead: true, render: (r) => <button type="button" className="rp-sr-open" onClick={() => openRow(r)} aria-label={`Open ${r.num || "invoice"} for ${r.billedTo}`}>{r.num || "Invoice"}</button> },
    { key: "who", header: "Customer", render: (r) => r.person ? <>{r.billedTo}<div className="rp-hint">Not a stockist</div></> : r.billedTo },
    { key: "date", header: "Issued", render: (r) => r.date ? fmtD(r.date) : "—" },
    { key: "due", header: "Due", render: (r) => r.dueDate ? fmtD(r.dueDate) : "—" },
    { key: "total", header: "Amount", numeric: true, render: (r) => fmt(r.total, r.code) },
    { key: "status", header: "Status", render: statusBadge },
    { key: "action", header: "Action", render: (r) => !writable || r.status === "paid" || r.status === "cancelled" ? <span className="rp-sk-uptodate">—</span>
      : r.status === "draft"
        ? <SecondaryButton size="sm" onClick={() => act(r, false)} busy={acting === r.id} disabled={!!acting} aria-label={`Mark ${r.num || "invoice"} sent`}>Mark sent</SecondaryButton>
        : <SecondaryButton size="sm" onClick={() => act(r, true)} busy={acting === r.id} disabled={!!acting} aria-label={`Mark ${r.num || "invoice"} paid`}>Mark paid</SecondaryButton> },
  ];
  const canMake = records.books.length > 0;
  // v4: New invoice and editing one are their own page (Back returns to the list).
  if (open?.kind === "edit") return <InvoiceEditor records={records} settings={settings} start={open.form} onClose={() => setOpen(null)} onSaved={saved} />;
  if (open?.kind === "repeat") return <InvoiceEditor kind="repeat" records={records} settings={settings} start={open.form} startSchedule={open.schedule} onClose={() => setOpen(null)}
    onSaved={(bookId, state, n) => saved(bookId, state, { ...n, lines: [...n.lines, "It's listed under Invoices › Repeating."] })} />;
  return (
    <div className="rp-sk">
      {writable && <PageActions>
        <SecondaryButton onClick={() => { setNotice(null); setOpen({ kind: "settings" }); }}>Invoice details</SecondaryButton>
        <SecondaryButton onClick={() => { setNotice(null); setOpen({ kind: "reminders" }); }}>Reminders</SecondaryButton>
        <SecondaryButton onClick={() => { setNotice(null); setOpen({ kind: "letterhead" }); }}>Letterhead</SecondaryButton>
        {canMake && <PrimaryButton onClick={() => { setNotice(null); setOpen({ kind: "edit", form: blankForm(records, settings, { person: !stockistNames(records).length }) }); }}>Create invoice</PrimaryButton>}
      </PageActions>}
      {notice && <Note notice={notice} />}
      {rows.length ? (<>
        <ul className="rp-sk-tiles" aria-label="Invoices at a glance">
          <li className="rp-sk-tile" data-tone="sky"><span>Outstanding</span><strong>{moneyText(summary.outstanding) || "Nothing"}</strong>
            <small>{summary.outstandingCount === 1 ? "1 invoice" : `${summary.outstandingCount} invoices`}</small></li>
          <li className="rp-sk-tile" data-tone={summary.overdueCount ? "apricot" : undefined}><span>Overdue</span><strong>{moneyText(summary.overdue) || "Nothing"}</strong>
            <small>{summary.overdueCount ? `${summary.overdueCount} to chase` : "None to chase"}</small></li>
          <li className="rp-sk-tile" data-tone="mint"><span>Paid, last 30 days</span><strong>{moneyText(summary.paid30) || "Nothing yet"}</strong>
            <small>{summary.paid30Count === 1 ? "1 invoice" : `${summary.paid30Count} invoices`}</small></li>
        </ul>
        <Tabs label="Show invoices" idPrefix="inv-" value={filter} onChange={(f) => { setFilter(f); setShown(10); }}
          tabs={INVOICE_FILTERS.map((f) => ({ id: f.id, label: f.label, count: summary.counts[f.id] }))} />
        <section className="rp-card rp-reorder-card" aria-label="Invoices">
          {listed.length ? <>
            <DataTable caption="Invoices" columns={columns} rows={listed.slice(0, shown)} rowKey={(r) => r.id} stackOnPhone onRowClick={openRow} />
            {listed.length > shown && <SecondaryButton size="sm" onClick={() => setShown((n) => n + 20)}>Show more ({listed.length - shown} left)</SecondaryButton>}
          </> : <EmptyState inline icon="🧾" title="Nothing here" description="No invoices with this status." />}
        </section>
      </>) : <section className="rp-card rp-reorder-card"><EmptyState inline icon="🧾" title="No invoices yet" description={w(canMake ? "Bill a stockist for what they sold, or anyone else for copies they bought." : "Add a title first, then bill stockists and buyers from here.")} /></section>}
      {confirmNode}

      {open?.kind === "settings" && <InvoiceSettingsDialog settings={settings} onClose={() => setOpen(null)} onSaved={(value, n) => { onSettingsSaved?.(value); setNotice(n); setOpen(null); }} />}
      {open?.kind === "letterhead" && <LetterheadDialog invoice={records.invoiceSettings} onClose={() => setOpen(null)} />}
      {open?.kind === "reminders" && <RemindersDialog records={records} onClose={() => setOpen(null)} onSaved={(value, text) => { onSettingsSaved?.(value); setNotice({ tone: "ok", lines: [text] }); setOpen(null); }} />}
      {current && <InvoiceView row={current} settings={settings} onClose={() => setOpen(null)} onSaved={saved}
        onEdit={() => setOpen({ kind: "edit", form: formFromInvoice(records, current) })}
        onRepeat={writable ? () => { const r = repeatFromInvoice(records, current); setNotice(null); setOpen({ kind: "repeat", form: r.form, schedule: r.schedule }); } : undefined}
        onCopy={() => { const f = copyForm(records, settings, current); setNotice(f.linkedDropped ? { tone: "ok", lines: [`Copied. Its lines are no longer tied to the stockist sales on ${current.num || "the original"}.`] } : null); setOpen({ kind: "edit", form: f }); }} />}
    </div>
  );
}

