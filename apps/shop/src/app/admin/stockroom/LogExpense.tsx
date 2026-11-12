// Tax centre › Log a business expense. One save at a time, the result always shown (WRITING.md). A same-day, same-words,
// same-amount expense asks for a second tap before it is added again.
import { useEffect, useRef, useState } from "react";

import { PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextField } from "../riso/components";
import { categoryFromRules } from "./taxRules";
import { addBusinessExpense, baseCurrencyOf, blankExpense, checkExpense, EXPENSE_CATEGORIES, EXPENSE_CURRENCIES, isDuplicate, tripChoices, type ExpenseErrors, type ExpenseForm } from "./taxExpense";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { taxRatesApi } from "./taxRates";
import { readReceipt, receiptPatch } from "./receiptRead";

type Row = Record<string, any>;
type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** `prefill`: a pending note being confirmed. Saving logs the expense and clears the note in the same save. */
export type Prefill = { noteId: string | number; form: ExpenseForm };

export function LogExpenseCard({ taxCenter, onSaved, prefill, onPrefillDone }: { taxCenter: Row | null; onSaved: (taxCenter: Row) => void; prefill?: Prefill | null; onPrefillDone?: () => void }) {
  const base = baseCurrencyOf(taxCenter);
  const [form, setForm] = useState<ExpenseForm>(() => blankExpense(base, todayText()));
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupAsked, setDupAsked] = useState(false);
  // One id per expense being typed, so a second tap or a retry cannot add it twice.
  const id = useRef(Date.now() + Math.floor(Math.random() * 1000));
  // A category picked by hand is never replaced by a sorting rule.
  const catTouched = useRef(false);
  const [ruled, setRuled] = useState<string | null>(null);
  const set = (patch: Partial<ExpenseForm>) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (patch.cat !== undefined) { catTouched.current = true; setRuled(null); }
      else if (patch.desc !== undefined && !catTouched.current) {
        const hit = categoryFromRules(taxCenter, patch.desc, EXPENSE_CATEGORIES);
        if (hit) { next.cat = hit; setRuled(hit); } else setRuled(null);
      }
      return next;
    });
    setDupAsked(false);
  };
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prefill) return;
    setForm(prefill.form); setErrors({}); setDupAsked(false); catTouched.current = true; setRuled(null);
    setNote({ tone: "ok", text: "Confirm the details and log it. The pending note clears itself once saved." });
    id.current = Date.now() + Math.floor(Math.random() * 1000);
    cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [prefill]);
  const photo = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  async function readPhoto(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setNote({ tone: "busy", text: "Reading the receipt…" });
    try {
      const facts = await readReceipt(file);
      const patch = receiptPatch(facts, currencies);
      if (!Object.keys(patch).length) { setNote({ tone: "warn", text: "Nothing on that photo could be read. Try a sharper, closer photo." }); return; }
      set(patch);
      setNote({ tone: "ok", text: `Filled in from the receipt${facts.tax ? ` (tax shown: ${facts.tax})` : ""}. Check it, then log it.` });
    } catch (error: any) {
      setNote({ tone: "error", text: error?.message || "The receipt couldn't be read. Type it in instead." });
    } finally { setReading(false); if (photo.current) photo.current.value = ""; }
  }
  const trips = tripChoices(taxCenter);
  const currencies = [...new Set([base, ...EXPENSE_CURRENCIES])];

  async function submit() {
    if (busy) return;
    const checked = checkExpense(form);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    if (!dupAsked && isDuplicate(taxCenter, form, checked.amount)) {
      setDupAsked(true);
      setNote({ tone: "warn", text: "An expense with the same date, words and amount is already logged. Tap Log expense again to add it anyway." });
      return;
    }
    setBusy(true);
    setNote({ tone: "busy", text: "Saving…" });
    try {
      // The rate for the expense's own date, looked up before the save (none found: saved as missing, filled in later).
      const rates = form.currency === base ? undefined : await taxRatesApi.expenseRatesFor([{ currency: form.currency, date: form.date }], taxCenter as Row | null);
      const result = await stockroomWriteApi.updateSetting("taxCenter", (current) => addBusinessExpense(current as Row | null, form, checked.amount, id.current, new Date(), prefill?.noteId, rates));
      if (result.status === "saved" || result.status === "unchanged") {
        onSaved((result.value as Row) || {});
        const d = describeResult(result);
        setNote({ tone: d.tone, text: d.tone === "ok" && !result.merged ? `Logged: ${form.desc.trim()}.` : d.text });
        setForm(blankExpense(base, todayText()));
        catTouched.current = false; setRuled(null);
        if (prefill) onPrefillDone?.();
        id.current = Date.now() + Math.floor(Math.random() * 1000);
        setDupAsked(false);
      } else setNote({ tone: "error", text: describeResult(result).text });
    } catch (error) {
      console.error("Tax centre save failed", error);
      setNote({ tone: "error", text: "That didn't save. Nothing was changed." });
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Log a business expense" description="Anything the press paid for. It joins the ledger below and the totals above.">
      <div ref={cardRef} />
      <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="rp-money-actions">
          <SecondaryButton type="button" busy={reading} onClick={() => photo.current?.click()}>{reading ? "Reading…" : "Read a receipt photo"}</SecondaryButton>
          <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void readPhoto(e.target.files?.[0])} />
        </div>
        <TextField label="What was it for?" placeholder="e.g. Squarespace or Shopify" value={form.desc} error={errors.desc} onChange={(e) => set({ desc: e.target.value })} />
        <div className="rp-money-form-row">
          <SelectField label="Tax category" hint={ruled ? "Filed here by one of your sorting rules." : undefined} value={form.cat} error={errors.cat} onChange={(e) => set({ cat: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          <TextField label="Date" type="date" value={form.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="rp-money-form-row">
          <SelectField label="Currency" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          <TextField label="Amount" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={form.amount} error={errors.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
        <TextField label="Trip or project (optional)" hint="Groups the expenses of one trip or fair." list="rp-money-trips" value={form.trip} onChange={(e) => set({ trip: e.target.value })} />
        <datalist id="rp-money-trips">{trips.map((t) => <option key={t.name} value={t.name} />)}</datalist>
        {trips.length > 0 && (
          <div className="rp-money-chips" role="group" aria-label="Recent trips">
            {trips.slice(0, 6).map((t) => (
              <SecondaryButton key={t.name} size="sm" type="button" aria-pressed={form.trip === t.name} onClick={() => set({ trip: form.trip === t.name ? "" : t.name })}>{t.name} <StatusBadge glyph={false}>{t.count}</StatusBadge></SecondaryButton>
            ))}
          </div>
        )}
        <TextField label="Reference (optional)" placeholder="Invoice or receipt number" value={form.ref} onChange={(e) => set({ ref: e.target.value })} />
        {form.currency !== base && <p className="rp-money-note">Paid in {form.currency}. It is counted in {base} at the rate for its date.</p>}
        <div className="rp-money-actions">
          <PrimaryButton type="submit" busy={busy}>{busy ? "Saving…" : "Log expense"}</PrimaryButton>
          {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
        </div>
      </form>
    </SectionCard>
  );
}
