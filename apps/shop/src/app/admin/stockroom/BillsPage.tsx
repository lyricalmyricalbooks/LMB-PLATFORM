// Bookkeeping › Bills to pay (v4 look: three tiles, filter pills with counts, one action per row, Add a bill in the
// header; the bill form is its own page with the form kit). Paying a bill logs it as an expense in the same save, with
// the bill's file as the receipt. Rules in bills.ts; every save goes through `updateSetting("taxCenter")` and its
// result is shown (WRITING.md).
import { useMemo, useRef, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { DataTable, Dialog, EmptyState, PageActions, PageHead, PrimaryButton, SecondaryButton, StatusBadge, Tabs, TextField, useConfirm, type Column } from "../riso/components";
import { FormField, FormPage, FormRow, FormSection, StatusBar, SummaryRail, formStatus } from "../riso/FormKit";
import {
  BILL_FILTERS, baseCurrencyOf, billFromNote, billToForm, billsSummary, blankBill, checkBill, deleteBill, inBillFilter, payBill, saveBill, sortedBills,
  supplierChoices, type Bill, type BillDue, type BillErrors, type BillFilter, type BillForm,
} from "./bills";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { receiptProblem, uploadReceipt } from "./receiptUpload";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import { moneyText } from "./stockists";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { EXPENSE_CATEGORIES, EXPENSE_CURRENCIES } from "./taxExpense";
import { pendingList } from "./taxPending";
import { taxRatesApi } from "./taxRates";
import "./money.css";
import "./sales.css";
import "./stockroom.css";
import "./stockists.css";

type Row = Record<string, any>;
type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TONE = { overdue: "danger", today: "warning", soon: "warning", later: "neutral", none: "neutral", paid: "success" } as const;

export function BillsPage({ load = stockroomApi.load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="your bills" load={load}>{(records) => <BillsBoard initial={records.taxCenter as Row | null} />}</RecordsGate>;
}

/** The Tax centre save every change here goes through. */
async function saveTaxCenter(mutate: (tc: Row | null) => Row): Promise<{ ok: true; taxCenter: Row; note: Note } | { ok: false; note: Note }> {
  try {
    const result = await stockroomWriteApi.updateSetting("taxCenter", (current) => mutate(current as Row | null));
    const said = describeResult(result);
    if (result.status === "saved" || result.status === "unchanged") return { ok: true, taxCenter: (result.value as Row) || {}, note: { tone: said.tone, text: said.text } };
    return { ok: false, note: { tone: "error", text: said.text } };
  } catch (error) {
    return { ok: false, note: { tone: "error", text: error instanceof Error ? error.message : "That didn't save. Nothing was changed." } };
  }
}

type Editing = { id: string; form: BillForm; isNew: boolean; fromNote?: string | number; file: string };

export function BillsBoard({ initial, today = todayText(), upload = uploadReceipt }: { initial: Row | null; today?: string; upload?: (file: File, now: number, folder: string) => Promise<string> }) {
  const [taxCenter, setTaxCenter] = useState<Row | null>(initial);
  const rows = useMemo(() => sortedBills(taxCenter, today), [taxCenter, today]);
  const summary = useMemo(() => billsSummary(rows), [rows]);
  const [filter, setFilter] = useState<BillFilter>("open");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [paying, setPaying] = useState<{ bill: Bill; date: string } | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();
  // One expense id per bill being paid, fixed before the first try, so a retry can't log it twice.
  const expenseIds = useRef(new Map<string, number>());
  const base = baseCurrencyOf(taxCenter);
  const listed = rows.filter((r) => inBillFilter(r.bill, r.due, filter));

  const pay = async () => {
    if (!paying || busy) return;
    const { bill, date } = paying;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setNote({ tone: "error", text: "Pick the day you paid it." }); return; }
    setBusy(true); setNote({ tone: "busy", text: "Saving…" });
    const expenseId = expenseIds.current.get(bill.id) ?? Date.now();
    expenseIds.current.set(bill.id, expenseId);
    let rates: Record<string, number> | undefined;
    try { rates = bill.currency === base ? undefined : await taxRatesApi.expenseRatesFor([{ currency: bill.currency, date }], taxCenter); } catch { rates = undefined; }
    const r = await saveTaxCenter((tc) => payBill(tc, bill.id, { paidDate: date, expenseId, now: new Date(), rates }));
    setBusy(false);
    if (!r.ok) { setNote(r.note); return; }
    setTaxCenter(r.taxCenter); setPaying(null);
    setNote({ tone: r.note.tone === "ok" ? "ok" : r.note.tone, text: r.note.tone === "ok" ? `${bill.supplier} is paid. It's logged as an expense on ${fmtD(date)}${bill.file ? ", with the bill as its receipt" : ""}.` : r.note.text });
  };
  const remove = async (bill: Bill) => {
    if (busy || !(await ask({ title: `Delete the bill from ${bill.supplier}?`, message: "Use this for a bill entered by mistake. Nothing in your books changes.", confirmLabel: "Delete bill" }))) return;
    setBusy(true);
    const r = await saveTaxCenter((tc) => deleteBill(tc, bill.id));
    setBusy(false);
    if (!r.ok) { setNote(r.note); return; }
    setTaxCenter(r.taxCenter); setEditing(null); setNote({ tone: "ok", text: "Bill deleted." });
  };

  if (editing) {
    return <BillEditor start={editing} taxCenter={taxCenter} today={today} upload={upload} onClose={() => setEditing(null)}
      onDelete={editing.isNew ? undefined : () => { const b = rows.find((r) => r.bill.id === editing.id)?.bill; if (b) void remove(b); }}
      onSaved={(tc, text) => { setTaxCenter(tc); setEditing(null); setNote({ tone: "ok", text }); setFilter("open"); }} />;
  }

  const columns: Column<{ bill: Bill; due: BillDue }>[] = [
    { key: "who", header: "Supplier", lead: true, render: ({ bill }) => <button type="button" className="rp-sr-open" disabled={bill.status === "paid"}
      onClick={() => { setNote(null); setEditing({ id: bill.id, form: billToForm(bill), isNew: false, file: bill.file }); }} aria-label={`Open the bill from ${bill.supplier}`}>{bill.supplier}</button> },
    { key: "what", header: "For", render: ({ bill }) => <>{bill.desc || bill.cat}{bill.ref && <div className="rp-hint">No. {bill.ref}</div>}</> },
    { key: "due", header: "Due", render: ({ bill }) => bill.dueDate ? <span style={{ whiteSpace: "nowrap" }}>{fmtD(bill.dueDate)}</span> : "—" },
    { key: "amount", header: "Amount", numeric: true, render: ({ bill }) => fmt(bill.amount, bill.currency) },
    { key: "status", header: "Status", render: ({ due }) => <StatusBadge tone={TONE[due.state]} glyph={due.state === "overdue" ? undefined : false}>{due.label}</StatusBadge> },
    { key: "file", header: "Bill", render: ({ bill }) => bill.file ? <a href={bill.file} target="_blank" rel="noreferrer">Open</a> : <span className="rp-hint">No file</span> },
    { key: "action", header: "Action", render: ({ bill }) => bill.status === "paid" ? <span className="rp-sk-uptodate">In your expenses</span>
      : <SecondaryButton size="sm" disabled={busy} onClick={() => { setNote(null); setPaying({ bill, date: today }); }} aria-label={`Mark the bill from ${bill.supplier} paid`}>Mark paid</SecondaryButton> },
  ];
  const notes = pendingList(taxCenter);

  return (
    <div className="rp-sk">
      <PageActions>
        <PrimaryButton onClick={() => { setNote(null); setEditing({ id: `bill-${Date.now().toString(36)}`, form: blankBill(base, today), isNew: true, file: "" }); }}>Add a bill</PrimaryButton>
      </PageActions>
      {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
      {rows.length ? <>
        <ul className="rp-sk-tiles" aria-label="Bills at a glance">
          <li className="rp-sk-tile" data-tone="sky"><span>To pay</span><strong>{moneyText(summary.open) || "Nothing"}</strong>
            <small>{summary.openCount === 1 ? "1 bill" : `${summary.openCount} bills`}</small></li>
          <li className="rp-sk-tile" data-tone={summary.lateCount || summary.soonCount ? "apricot" : undefined}><span>{summary.lateCount ? "Late" : "Due this week"}</span>
            <strong>{moneyText(summary.lateCount ? summary.late : summary.soon) || "Nothing"}</strong>
            <small>{summary.lateCount ? `${summary.lateCount} past their day` : summary.soonCount ? `${summary.soonCount} due soon` : "Nothing due soon"}</small></li>
          <li className="rp-sk-tile" data-tone="mint"><span>Paid, last 30 days</span><strong>{moneyText(summary.paid30) || "Nothing yet"}</strong>
            <small>Logged as expenses</small></li>
        </ul>
        <Tabs label="Show bills" idPrefix="bill-" value={filter} onChange={setFilter}
          tabs={BILL_FILTERS.map((f) => ({ id: f.id, label: f.label, count: summary.counts[f.id] }))} />
        <section className="rp-card rp-reorder-card" aria-label="Bills">
          {listed.length
            ? <DataTable caption="Bills" columns={columns} rows={listed} rowKey={(r) => r.bill.id} stackOnPhone />
            : <EmptyState inline icon="✅" title={filter === "open" ? "Nothing to pay" : "Nothing here"} description={filter === "open" ? "Every bill is paid." : "No bills with this status."} />}
        </section>
      </> : <section className="rp-card rp-reorder-card"><EmptyState inline icon="🧾" title="No bills yet" description="Add a bill from your printer or a supplier with the day it's due. You'll be told before it's due, and paying it logs the expense." /></section>}
      {notes.length > 0 && <p className="rp-hint">You have {notes.length === 1 ? "a cost" : `${notes.length} costs`} noted under Expenses › Pending. When the bill comes in, add it here and pick the note: it's cleared for you.</p>}
      {confirmNode}
      {paying && (
        <Dialog open onClose={busy ? () => undefined : () => setPaying(null)} title={`Mark the bill from ${paying.bill.supplier} paid`} description={fmt(paying.bill.amount, paying.bill.currency)}
          footer={<><SecondaryButton onClick={() => setPaying(null)} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={pay} busy={busy}>{busy ? "Saving…" : "Mark paid"}</PrimaryButton></>}>
          <TextField label="Paid on" type="date" value={paying.date} onChange={(e) => setPaying((p) => (p ? { ...p, date: e.target.value } : p))} />
          <p className="rp-money-note">It's logged as an expense under {paying.bill.cat} on that day{paying.bill.file ? ", with the bill attached as the receipt" : ""}.</p>
          {note?.tone === "error" && <p className="rp-sr-save" data-tone="error" role="alert">{note.text}</p>}
        </Dialog>
      )}
    </div>
  );
}

function BillEditor({ start, taxCenter, today, upload, onClose, onSaved, onDelete }: {
  start: Editing; taxCenter: Row | null; today: string; upload: (file: File, now: number, folder: string) => Promise<string>;
  onClose: () => void; onSaved: (taxCenter: Row, text: string) => void; onDelete?: () => void;
}) {
  const [form, setForm] = useState<BillForm>(start.form);
  const [startText] = useState(() => JSON.stringify(start.form));
  const [fromNote, setFromNote] = useState<string | number | undefined>(start.fromNote);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<BillErrors>({});
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const base = baseCurrencyOf(taxCenter);
  const set = (patch: Partial<BillForm>) => { setNote(null); setForm((f) => ({ ...f, ...patch })); };
  const suppliers = supplierChoices(taxCenter);
  const notes = pendingList(taxCenter);
  const currencies = [...new Set([base, form.currency, ...EXPENSE_CURRENCIES])];
  const missing = [!form.supplier.trim(), !(Number(form.amount) > 0), !form.dueDate].filter(Boolean).length;
  const status = formStatus({ missing, create: start.isNew, verb: "add", dirty: JSON.stringify(form) !== startText || !!file });

  const submit = async () => {
    if (busy) return;
    const checked = checkBill(form);
    if (!checked.ok) { setErrors(checked.errors); setNote({ tone: "warn", text: "Fill in the highlighted fields." }); return; }
    setErrors({}); setBusy(true);
    // The file is kept first, so a bill is never saved pointing at a file that didn't arrive.
    let url: string | undefined;
    if (file) {
      setNote({ tone: "busy", text: "Keeping the bill's file…" });
      try { url = await upload(file, Date.now(), "Bills"); }
      catch (e) { setBusy(false); setNote({ tone: "error", text: e instanceof Error ? e.message : "The file couldn't be kept, so nothing was saved." }); return; }
    }
    setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter((tc) => saveBill(tc, form, checked.amount, start.id, { now: Date.now(), file: url, fromNote }));
    setBusy(false);
    if (!r.ok) { setNote(r.note); return; }
    onSaved(r.taxCenter, start.isNew ? `Bill from ${form.supplier.trim()} added. Due ${fmtD(form.dueDate)}.` : "Bill saved.");
  };

  return (
    <>
      <PageHead title={start.isNew ? "Add a bill" : `Bill from ${start.form.supplier}`} description="A bill you have to pay: from your printer, a supplier or anyone else." back={{ label: "Bills to pay", onClick: onClose }} />
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormPage rail={<SummaryRail tone="white" title={form.supplier.trim() || "New bill"} value={fmt(Number(form.amount) || 0, form.currency || base)}
          sub={form.dueDate ? (form.dueDate < today ? `Was due ${fmtD(form.dueDate)}` : `Due ${fmtD(form.dueDate)}`) : "No due day yet"}
          rows={[{ label: "Category", value: form.cat }, ...(form.ref ? [{ label: "Bill number", value: form.ref }] : [])]} note="Not in your expenses until you mark it paid." />}>
          <FormSection title="Who and what" description="The supplier and what the bill is for.">
            {start.isNew && notes.length > 0 && (
              <FormField label="From a cost you noted" hint="Optional. Fills this in and clears the note when you save.">
                {(a) => <select {...a} value={fromNote == null ? "" : String(fromNote)} onChange={(e) => {
                  const n = notes.find((x) => String(x.id) === e.target.value);
                  setFromNote(n ? n.id : undefined);
                  if (n) setForm((f) => ({ ...billFromNote(n, base, today), supplier: f.supplier, ref: f.ref }));
                }}>
                  <option value="">None</option>
                  {notes.map((n) => <option key={String(n.id)} value={String(n.id)}>{n.desc}</option>)}
                </select>}
              </FormField>
            )}
            <FormRow>
              <FormField label="Supplier" required empty={!form.supplier.trim()} error={errors.supplier}>
                {(a) => <><input {...a} list="rp-bill-suppliers" placeholder="e.g. Your printer" value={form.supplier} onChange={(e) => set({ supplier: e.target.value })} />
                  <datalist id="rp-bill-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist></>}
              </FormField>
              <FormField label="Bill number" hint="Optional.">{(a) => <input {...a} value={form.ref} onChange={(e) => set({ ref: e.target.value })} />}</FormField>
            </FormRow>
            <FormField label="What it's for" hint="Optional. Shown on the expense when it's paid.">{(a) => <input {...a} placeholder="e.g. Second printing, 500 copies" value={form.desc} onChange={(e) => set({ desc: e.target.value })} />}</FormField>
            <FormField label="Tax category">{(a) => <select {...a} value={form.cat} onChange={(e) => set({ cat: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>}</FormField>
          </FormSection>
          <FormSection title="Amount and days" description="You're told three days before it's due.">
            <FormRow>
              <FormField label="Amount" required empty={!(Number(form.amount) > 0)} error={errors.amount}>{(a) => <input {...a} inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />}</FormField>
              <FormField label="Currency">{(a) => <select {...a} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>}</FormField>
            </FormRow>
            <FormRow>
              <FormField label="Date on the bill" error={errors.billDate}>{(a) => <input {...a} type="date" value={form.billDate} onChange={(e) => set({ billDate: e.target.value })} />}</FormField>
              <FormField label="Pay by" required empty={!form.dueDate} error={errors.dueDate}>{(a) => <input {...a} type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />}</FormField>
            </FormRow>
          </FormSection>
          <FormSection title="The bill" description="A photo or PDF of it. Kept as the receipt once it's paid.">
            {start.file && !file && <p className="rp-money-note"><a href={start.file} target="_blank" rel="noreferrer">Open the bill on file</a></p>}
            <button type="button" className="rp-fk-drop" onClick={() => pick.current?.click()} disabled={busy}>
              {file ? `${file.name} (choose another)` : start.file ? "Replace the file" : "Add a photo or PDF of the bill"}
            </button>
            <input ref={pick} type="file" accept="image/*,application/pdf" hidden onChange={(e) => {
              const f = e.target.files?.[0] || null;
              const problem = f ? receiptProblem(f) : null;
              if (problem) { setNote({ tone: "error", text: problem }); setFile(null); } else setFile(f);
              if (pick.current) pick.current.value = "";
            }} />
            <FormField label="Note" hint="Optional. Only you see it.">{(a) => <textarea {...a} rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />}</FormField>
            {onDelete && <button type="button" className="rp-fk-pill" data-tone="danger" style={{ alignSelf: "flex-start" }} onClick={onDelete} disabled={busy}>Delete bill</button>}
          </FormSection>
        </FormPage>
        {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
        <StatusBar status={status} primaryLabel={start.isNew ? "Add bill" : "Save bill"} busy={busy} blocked={missing > 0}
          onBlocked={() => setNote({ tone: "warn", text: "Fill in the highlighted fields." })} onPrimary={() => void submit()} onCancel={onClose} cancelLabel={start.isNew ? "Cancel" : "Discard"} />
      </form>
    </>
  );
}
