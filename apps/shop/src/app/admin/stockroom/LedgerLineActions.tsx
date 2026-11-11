// The ledger's per-line controls for a business expense: change its category, edit it, attach a receipt, or remove it
// after a confirm.
import { useState } from "react";

import { ConfirmDialog, Dialog, GhostButton, PrimaryButton, SecondaryButton, SelectField, TextField } from "../riso/components";
import { baseCurrencyOf, checkExpense, EXPENSE_CATEGORIES, EXPENSE_CURRENCIES, type ExpenseErrors } from "./taxExpense";
import { changeCategory, editExpense, expenseToForm, receiptsOf, removeExpense } from "./taxLedger";
import { taxRatesApi } from "./taxRates";
import { AttachReceiptButton, defaultUpload, useLineSave, type Upload } from "./lineSave";
import type { SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
type Line = { itemId?: unknown; desc?: string; cat?: string; receipt?: unknown; receiptFiles?: unknown; receiptExempt?: boolean };

export function LedgerLineActions({ line, taxCenter, onSaved, onNote, upload = defaultUpload }: {
  line: Line; onSaved: (taxCenter: Row) => void; onNote: (note: SaveNote) => void;
  /** The Tax centre on screen: the Edit window starts from the expense as saved. */ taxCenter?: Row | null;
  /** Uploads one receipt file and returns its address (tests pass a fake). */ upload?: Upload;
}) {
  const { busy, run, attach } = useLineSave(onSaved, onNote);
  const receipts = receiptsOf(line);
  const [asking, setAsking] = useState(false);
  const cats = EXPENSE_CATEGORIES.includes(line.cat || "") || !line.cat ? EXPENSE_CATEGORIES : [line.cat!, ...EXPENSE_CATEGORIES];

  return (
    <div className="rp-money-line-actions">
      <SelectField label={`Category for ${line.desc || "this expense"}`} hideLabel value={line.cat || ""} disabled={busy}
        onChange={(e) => { const cat = e.target.value; void run((tc) => changeCategory(tc, line.itemId, cat), `Moved to ${cat}.`); }}>
        {!line.cat && <option value="">Pick a category</option>}
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </SelectField>
      {receipts.length > 0
        ? <a className="rp-money-receipt" href={receipts[0]} target="_blank" rel="noopener noreferrer">{receipts.length > 1 ? `Receipts (${receipts.length})` : "Receipt"}</a>
        : !line.receiptExempt && <AttachReceiptButton desc={line.desc} busy={busy} onFile={(f) => void attach(line.itemId, f, upload)} />}
      {taxCenter && <EditExpense line={line} taxCenter={taxCenter} busy={busy} run={run} />}
      <GhostButton size="sm" disabled={busy} onClick={() => setAsking(true)}>Remove</GhostButton>
      <ConfirmDialog open={asking} title="Remove this expense?" confirmLabel="Remove expense"
        message={`“${line.desc || "This expense"}” comes out of your ledger and your totals.`}
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); void run((tc) => removeExpense(tc, line.itemId), "Expense removed."); }} />
    </div>
  );
}

/** "Edit": the old Edit expense window. A new amount, currency or date is valued again at the rate for its date. */
function EditExpense({ line, taxCenter, busy, run }: { line: Line; taxCenter: Row; busy: boolean; run: (mutate: (tc: Row | null) => Row, done: string) => Promise<void> }) {
  const row = (Array.isArray(taxCenter.businessExpenses) ? taxCenter.businessExpenses : []).find((e: Row) => String(e.id) === String(line.itemId));
  const [form, setForm] = useState<ReturnType<typeof expenseToForm> | null>(null);
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [saving, setSaving] = useState(false);
  if (!row) return null;
  const base = baseCurrencyOf(taxCenter);
  const currencies = [...new Set([base, ...EXPENSE_CURRENCIES, form?.currency || base])];
  const cats = form && !EXPENSE_CATEGORIES.includes(form.cat) ? [form.cat, ...EXPENSE_CATEGORIES] : EXPENSE_CATEGORIES;
  const set = (patch: Partial<ReturnType<typeof expenseToForm>>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const close = () => { setForm(null); setErrors({}); };

  async function save() {
    if (!form || saving) return;
    const checked = checkExpense({ ...form, cat: EXPENSE_CATEGORIES.includes(form.cat) ? form.cat : "Other" });
    if (!checked.ok) { setErrors(checked.errors); return; }
    const amount = Number(form.amount);
    setSaving(true);
    const rates = form.currency === base ? null : await taxRatesApi.expenseRatesFor([{ currency: form.currency, date: form.date }], taxCenter);
    const rate = form.currency === base ? 1 : rates?.[`${form.currency.toUpperCase()}@${form.date}`] || 0;
    const values = form;
    setSaving(false); close();
    await run((tc) => editExpense(tc, line.itemId, values, amount, rate), "Expense updated.");
  }

  return (
    <>
      <GhostButton size="sm" disabled={busy} onClick={() => setForm(expenseToForm(row))}>Edit</GhostButton>
      {form && (
        <Dialog open onClose={close} title="Edit expense"
          footer={<><SecondaryButton onClick={close}>Cancel</SecondaryButton><PrimaryButton busy={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</PrimaryButton></>}>
          <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <TextField label="What was it for?" value={form.desc} error={errors.desc} onChange={(e) => set({ desc: e.target.value })} />
            <div className="rp-money-form-row">
              <SelectField label="Tax category" value={form.cat} onChange={(e) => set({ cat: e.target.value })}>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <TextField label="Date" type="date" value={form.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="rp-money-form-row">
              <SelectField label="Currency" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <TextField label="Amount" type="number" inputMode="decimal" min={0} step="0.01" value={form.amount} error={errors.amount} onChange={(e) => set({ amount: e.target.value })} />
            </div>
            <TextField label="Trip or project (optional)" value={form.trip} onChange={(e) => set({ trip: e.target.value })} />
            <TextField label="Reference (optional)" value={form.ref} onChange={(e) => set({ ref: e.target.value })} />
            {form.currency !== base && <p className="rp-money-note">Paid in {form.currency}. It is counted in {base} at the rate for its date.</p>}
          </form>
        </Dialog>
      )}
    </>
  );
}
