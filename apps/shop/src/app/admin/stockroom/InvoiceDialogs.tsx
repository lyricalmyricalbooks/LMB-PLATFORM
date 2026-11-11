// Stockroom › Stockists › Invoices: the list of every invoice, the invoice details (name, address, terms, bank), and
// making, editing, sending, deleting and printing an invoice. Rules and saves are in invoiceMake.ts, the printed page in
// invoicePaper.ts. Every save goes through stockroomWrite.ts and its result is always shown (WRITING.md).
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { DataTable, DestructiveButton, Dialog, EmptyState, IconButton, InkButton, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, useConfirm, type Column } from "../riso/components";
import { useShopWords } from "../shopWords";
import { shopProfile } from "../../../lib/shopProfile";
import { shopNameFromSettings } from "../../../shared/shopIdentity";
import { adminApi } from "../api";
import {
  blankForm, blankLine, cleanInvoiceSettings, copyForm, invoiceEmail, deleteInvoiceChange, formBookIds, formFromInvoice, formTotals, INVOICE_SETTINGS_KEY, invoiceList,
  invoiceProblem, invoiceSettingsChange, currencyFor, markSentChange, newInvoiceId, nextNumber, ownerChoices, pendingSaleLines, saveInvoiceChange,
  stockistNames, todayText, type InvoiceForm, type InvoiceLine, type InvoiceRow, type InvoiceSettings,
} from "./invoiceMake";
import { invoicePage, printInvoice } from "./invoicePaper";
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
        <TextField label="Tax number (optional)" hint="GST/HST or VAT number." value={form.vat} onChange={set("vat")} />
        <TextField label="Usual terms" hint="Filled in on each new invoice." value={form.terms} onChange={set("terms")} />
        <TextArea label="Bank transfer details (optional)" rows={3} value={form.bank} onChange={set("bank")} />
        <TextField label="Thank-you line" placeholder={w("Thank you for stocking our books.")} value={form.footer} onChange={set("footer")} />
        {problem && <Note notice={problem} />}
      </form>
    </Dialog>
  );
}

// ── Making and editing ─────────────────────────────────────────────────────────────────────────────────────────────

export function InvoiceEditor({ records, settings, start, onClose, onSaved, onDeleted }: {
  records: StockroomRecords; settings: InvoiceSettings; start: InvoiceForm; onClose: () => void; onSaved: BookSaved; onDeleted?: BookSaved;
}) {
  const w = useShopWords();
  const [form, setForm] = useState<InvoiceForm>(start);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<InvoiceNotice | null>(null);
  const [ask, confirmNode] = useConfirm();
  // One id per new invoice, fixed before the first try, so a retry after a failed save can't file it twice.
  const id = useRef(newInvoiceId(Date.now()));
  const names = useMemo(() => stockistNames(records), [records]);
  const owners = ownerChoices(records, form);
  const totals = formTotals(form);
  const code = form.currencyCode;

  // A number the admin put there follows the titles billed (several titles get the press's initials); a typed one stays.
  const renumber = (f: InvoiceForm): InvoiceForm => {
    if (f.editingId || !f.ownerBookId || f.num !== f.autoNum) return f;
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
    const problem = invoiceProblem(form, records);
    if (problem) { setNote({ tone: "error", lines: [problem] }); return; }
    setBusy(true); setNote(null);
    const r = await saveBook(form.ownerBookId, saveInvoiceChange(form, status, { books: records.books, id: id.current, now: Date.now() }),
      `${form.num || "Invoice"} ${form.editingId ? "saved" : status === "draft" ? "saved as a draft" : "saved"}.`);
    if (!r.ok) { setNote(r.notice); setBusy(false); return; }
    onSaved(form.ownerBookId, r.state, r.notice);
  };
  const remove = async () => {
    if (busy || !form.editingId) return;
    if (!(await ask({ title: `Delete ${form.num || "this invoice"}?`, message: "Its sales go back to unbilled. This can't be undone.", confirmLabel: "Delete invoice" }))) return;
    setBusy(true);
    const r = await saveBook(form.ownerBookId, deleteInvoiceChange(form.editingId), `${form.num || "Invoice"} deleted.`);
    if (!r.ok) { setNote(r.notice); setBusy(false); return; }
    (onDeleted || onSaved)(form.ownerBookId, r.state, r.notice);
  };

  const editingSent = !!form.editingId && form.status !== "draft";
  const canDelete = !!form.editingId && form.status !== "paid";
  return (
    <Dialog open size="lg" onClose={busy ? () => undefined : onClose} title={form.editingId ? `Edit ${form.num || "invoice"}` : "New invoice"}
      description={form.status === "paid" ? "Paid. Fixing a detail keeps it paid." : undefined}
      footerStart={canDelete ? <DestructiveButton onClick={remove} disabled={busy}>Delete</DestructiveButton> : undefined}
      footer={<>
        <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
        {!editingSent && <SecondaryButton onClick={() => save("draft")} disabled={busy}>Save draft</SecondaryButton>}
        <PrimaryButton onClick={() => save("sent")} busy={busy}>{busy ? "Saving…" : editingSent ? "Save changes" : "Save invoice"}</PrimaryButton>
      </>}>
      <form className="rp-money-form rp-inv-form" onSubmit={(e) => { e.preventDefault(); void save("sent"); }}>
        <div className="rp-sk-chips" role="group" aria-label="Who is this invoice for?">
          {(["store", "person"] as const).map((mode) => {
            const Btn = form.billTo === mode ? InkButton : SecondaryButton;
            return <Btn key={mode} size="sm" type="button" aria-pressed={form.billTo === mode} disabled={!!form.editingId && form.billTo !== mode}
              onClick={() => pickWho(mode, mode === "store" ? form.stockist || names[0] || "" : "")}>{mode === "store" ? "A stockist" : "Someone else"}</Btn>;
          })}
        </div>
        {form.billTo === "store" ? (
          <div className="rp-money-form-row">
            <SelectField label="Stockist" value={form.stockist} disabled={!!form.editingId} onChange={(e) => pickWho("store", e.target.value)}>
              {!names.length && <option value="">No stockists yet</option>}
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </SelectField>
            <SelectField label={w("Filed under")} hint={w("The title whose records keep this invoice.")} value={form.ownerBookId} disabled={!!form.editingId} onChange={(e) => set({ ownerBookId: e.target.value, currencyCode: currencyFor(records, e.target.value) })}>
              {owners.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </SelectField>
          </div>
        ) : (
          <>
            <div className="rp-money-form-row">
              <TextField label="Name" value={form.person.name} onChange={(e) => set({ person: { ...form.person, name: e.target.value } })} />
              <TextField label="Email (optional)" type="email" value={form.person.email} onChange={(e) => set({ person: { ...form.person, email: e.target.value } })} />
            </div>
            <TextField label="Address (optional)" value={form.person.address} onChange={(e) => set({ person: { ...form.person, address: e.target.value } })} />
            <div className="rp-money-form-row">
              <TextField label="City" value={form.person.city} onChange={(e) => set({ person: { ...form.person, city: e.target.value } })} />
              <TextField label="Province or region" value={form.person.region} onChange={(e) => set({ person: { ...form.person, region: e.target.value } })} />
            </div>
            <div className="rp-money-form-row">
              <TextField label="Postal code" value={form.person.postal} onChange={(e) => set({ person: { ...form.person, postal: e.target.value } })} />
              <TextField label="Country" value={form.person.country} onChange={(e) => set({ person: { ...form.person, country: e.target.value } })} />
            </div>
            <SelectField label={w("Filed under")} hint={w("The title whose records keep this invoice.")} value={form.ownerBookId} disabled={!!form.editingId} onChange={(e) => set({ ownerBookId: e.target.value, currencyCode: currencyFor(records, e.target.value) })}>
              {owners.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </SelectField>
          </>
        )}
        <div className="rp-inv-row3">
          <TextField label="Invoice number" value={form.num} onChange={(e) => set({ num: e.target.value })} />
          <TextField label="Issue date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          <TextField label="Due date" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </div>

        <h3 className="rp-sk-h">Lines</h3>
        <ul className="rp-inv-lines">
          {form.items.map((it, i) => (
            <li key={i} className="rp-inv-line">
              <TextField label="Item" hideLabel={i > 0} value={it.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <TextField label="Qty" hideLabel={i > 0} inputMode="decimal" value={it.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <TextField label="Unit price" hideLabel={i > 0} inputMode="decimal" value={it.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <TextField label="Disc. %" hideLabel={i > 0} inputMode="decimal" value={it.discountPct} onChange={(e) => setLine(i, { discountPct: e.target.value })} />
              <IconButton label={`Remove line ${i + 1}`} type="button" disabled={form.items.length === 1} onClick={() => set({ items: form.items.filter((_, j) => j !== i) })}>×</IconButton>
            </li>
          ))}
        </ul>
        <div className="rp-sk-actions">
          <SecondaryButton size="sm" type="button" onClick={() => set({ items: [...form.items, blankLine()] })}>Add a line</SecondaryButton>
          {form.billTo === "store" && <SecondaryButton size="sm" type="button" onClick={bringInSales}>Add unpaid sales</SecondaryButton>}
        </div>

        <div className="rp-money-form-row">
          <div className="rp-inv-discount">
            <SelectField label="Discount" value={form.discountType} onChange={(e) => set({ discountType: e.target.value === "flat" ? "flat" : "percent" })}>
              <option value="percent">Percent</option><option value="flat">Amount</option>
            </SelectField>
            <TextField label={form.discountType === "percent" ? "Discount %" : "Discount amount"} hideLabel inputMode="decimal" placeholder="0" value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />
          </div>
          <TextField label="Tax %" inputMode="decimal" placeholder="0" value={form.taxRate} onChange={(e) => set({ taxRate: e.target.value })} />
        </div>
        <dl className="rp-inv-totals">
          <div><dt>Subtotal</dt><dd>{fmt(totals.subtotal, code)}</dd></div>
          {totals.discount > 0 && <div><dt>Discount</dt><dd>−{fmt(totals.discount, code)}</dd></div>}
          {totals.tax > 0 && <div><dt>Tax</dt><dd>{fmt(totals.tax, code)}</dd></div>}
          <div data-strong><dt>Total due</dt><dd>{fmt(totals.total, code)}</dd></div>
        </dl>
        <TextField label="Payment link or e-Transfer email (optional)" value={form.paymentLink} onChange={(e) => set({ paymentLink: e.target.value })} />
        <TextArea label="Notes (optional)" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        <TextField label="Terms" value={form.terms} onChange={(e) => set({ terms: e.target.value })} />
        {note && <Note notice={note} />}
      </form>
      {confirmNode}
    </Dialog>
  );
}

// ── One invoice: the printed page, with its actions ───────────────────────────────────────────────────────────────

export function InvoiceView({ row, settings, onClose, onEdit, onCopy, onSaved }: {
  row: InvoiceRow; settings: InvoiceSettings; onClose: () => void; onEdit: () => void; onCopy?: () => void; onSaved: BookSaved;
}) {
  const mail = invoiceEmail(row.inv, settings, row.code);
  const mailto = `mailto:${encodeURIComponent(mail.to)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<InvoiceNotice | null>(null);
  const today = todayText();
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
        <SecondaryButton onClick={() => { window.location.href = mailto; }} disabled={busy}>{mail.to ? "Email" : "Email (no address on file)"}</SecondaryButton>
        {row.status === "draft" && <SecondaryButton onClick={send} busy={busy}>{busy ? "Saving…" : "Mark sent"}</SecondaryButton>}
        <PrimaryButton onClick={() => printInvoice(row.inv, settings, today)} disabled={busy}>Print or save PDF</PrimaryButton>
      </>}>
      {note && <Note notice={note} />}
      <iframe className="rp-inv-paper" title={`Invoice ${row.num}`} srcDoc={invoicePage(row.inv, settings, today)} />
    </Dialog>
  );
}

// ── The list ─────────────────────────────────────────────────────────────────────────────────────────────────────

const statusBadge = (r: InvoiceRow) => r.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge>
  : <StatusBadge tone={r.status === "paid" ? "success" : r.status === "sent" ? "warning" : "neutral"} glyph={false}>{r.status === "sent" ? "Owed" : r.status[0].toUpperCase() + r.status.slice(1)}</StatusBadge>;

type Open = { kind: "settings" } | { kind: "edit"; form: InvoiceForm } | { kind: "view"; id: string };

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
  const current = open?.kind === "view" ? rows.find((r) => r.id === open.id) || null : null;
  const saved: BookSaved = (bookId, state, n) => { onBookSaved?.(bookId, state); setNotice(n); setOpen(null); };

  const columns: Column<InvoiceRow>[] = [
    { key: "num", header: "Invoice", lead: true, render: (r) => <>
      <button type="button" className="rp-sr-open" onClick={() => { setNotice(null); setOpen({ kind: "view", id: r.id }); }} aria-label={`Open ${r.num || "invoice"} for ${r.billedTo}`}>{r.num || "Invoice"}</button>
      <div className="rp-hint">{r.person ? `${r.billedTo} (not a stockist)` : r.billedTo}</div>
    </> },
    { key: "date", header: "Date", render: (r) => <>{r.date ? fmtD(r.date) : "—"}{r.dueDate && r.status !== "paid" && <div className="rp-hint">Due {fmtD(r.dueDate)}</div>}</> },
    { key: "total", header: "Total", numeric: true, render: (r) => fmt(r.total, r.code) },
    { key: "status", header: "Status", render: statusBadge },
  ];
  const canMake = records.books.length > 0;
  return (
    <section className="rp-card rp-reorder-card" aria-labelledby="rp-inv-title">
      <div className="rp-inv-head">
        <h2 className="rp-card-title" id="rp-inv-title">Invoices</h2>
        {writable && <div className="rp-sk-actions">
          <SecondaryButton size="sm" onClick={() => { setNotice(null); setOpen({ kind: "settings" }); }}>Invoice details</SecondaryButton>
          {canMake && <PrimaryButton size="sm" onClick={() => { setNotice(null); setOpen({ kind: "edit", form: blankForm(records, settings, { person: !stockistNames(records).length }) }); }}>New invoice</PrimaryButton>}
        </div>}
      </div>
      {notice && <Note notice={notice} />}
      {rows.length ? (
        <>
          <DataTable caption="Invoices" columns={columns} rows={rows.slice(0, shown)} rowKey={(r) => r.id} stackOnPhone onRowClick={(r) => { setNotice(null); setOpen({ kind: "view", id: r.id }); }} />
          {rows.length > shown && <SecondaryButton size="sm" onClick={() => setShown((n) => n + 20)}>Show more ({rows.length - shown} left)</SecondaryButton>}
        </>
      ) : <EmptyState inline icon="🧾" title="No invoices yet" description={w(canMake ? "Bill a stockist for what they sold, or anyone else for copies they bought." : "Add a title first, then bill stockists and buyers from here.")} />}

      {open?.kind === "settings" && <InvoiceSettingsDialog settings={settings} onClose={() => setOpen(null)} onSaved={(value, n) => { onSettingsSaved?.(value); setNotice(n); setOpen(null); }} />}
      {open?.kind === "edit" && <InvoiceEditor records={records} settings={settings} start={open.form} onClose={() => setOpen(null)} onSaved={saved} />}
      {current && <InvoiceView row={current} settings={settings} onClose={() => setOpen(null)} onSaved={saved}
        onEdit={() => setOpen({ kind: "edit", form: formFromInvoice(records, current) })}
        onCopy={() => { const f = copyForm(records, settings, current); setNotice(f.linkedDropped ? { tone: "ok", lines: [`Copied. Its lines are no longer tied to the stockist sales on ${current.num || "the original"}.`] } : null); setOpen({ kind: "edit", form: f }); }} />}
    </section>
  );
}

