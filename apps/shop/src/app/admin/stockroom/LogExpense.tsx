// Tax centre › Log a business expense. One save at a time, the result always shown (WRITING.md). A same-day, same-words,
// same-amount expense asks for a second tap before it is added again.
import { useEffect, useRef, useState } from "react";

import { fmt } from "@stockroom/money.js";
import { shopDayLabel } from "../discountDescribe";
import { PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextField } from "../riso/components";
import { FormField, FormPage, FormRow, FormSection, StatusBar, SummaryRail, formStatus } from "../riso/FormKit";
import { categoryFromRules } from "./taxRules";
import { addBusinessExpense, baseCurrencyOf, blankExpense, checkExpense, EXPENSE_CATEGORIES, EXPENSE_CURRENCIES, isDuplicate, tripChoices, type ExpenseErrors, type ExpenseForm } from "./taxExpense";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import { taxRatesApi } from "./taxRates";
import { readReceipt, receiptPatch } from "./receiptRead";

type Row = Record<string, any>;
type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
/** "Expenses · Nov": the month the expense is filed under. */
const landsIn = (date: string) => { const m = /^\d{4}-(\d{2})-\d{2}$/.exec(date || ""); return m ? `Expenses · ${new Date(Date.UTC(2000, Number(m[1]) - 1, 15)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}` : "Expenses"; };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** `prefill`: a pending note being confirmed. Saving logs the expense and clears the note in the same save. */
export type Prefill = { noteId: string | number; form: ExpenseForm };

/**
 * `page`: the v4 New expense page (form kit: sections on the left, the amount in a rail, one status bar). Without it,
 * the card the Tax centre shows.
 */
export function LogExpenseCard({ taxCenter, onSaved, prefill, onPrefillDone, page, onCancel }: { taxCenter: Row | null; onSaved: (taxCenter: Row) => void; prefill?: Prefill | null; onPrefillDone?: () => void; page?: boolean; onCancel?: () => void }) {
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

  if (page) {
    const missing = [form.desc.trim(), String(form.amount).trim()].filter((v) => !v).length;
    const amount = Number(form.amount) || 0;
    return (
      <form ref={cardRef as any} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormPage rail={
          <SummaryRail tone="white" title="This entry" value={fmt(amount, form.currency)} sub="goes out"
            rows={[{ label: "Category", value: form.cat }, { label: "Date", value: shopDayLabel(form.date) || "—" }, ...(form.trip ? [{ label: "Trip", value: form.trip }] : []), { label: "Lands in", value: landsIn(form.date) }]}
            note={form.currency !== base ? `Counted in ${base} at the rate for its date.` : undefined} />
        }>
          <FormSection title="What for" description="A few words you’ll recognise later.">
            <FormField label="What was it for?" required empty={!form.desc.trim()} hint={errors.desc}>
              {(a) => <input {...a} placeholder="e.g. Squarespace or Shopify" value={form.desc} onChange={(e) => set({ desc: e.target.value })} />}
            </FormField>
            <FormRow>
              <FormField label="Tax category" hint={errors.cat || (ruled ? "Filed here by one of your sorting rules." : undefined)}>
                {(a) => <select {...a} value={form.cat} onChange={(e) => set({ cat: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
              </FormField>
              <FormField label="Date" hint={errors.date}>
                {(a) => <input {...a} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />}
              </FormField>
            </FormRow>
            <FormField label="Trip or project" hint="Optional. Groups the expenses of one trip or fair.">
              {(a) => <input {...a} list="rp-money-trips" value={form.trip} onChange={(e) => set({ trip: e.target.value })} />}
            </FormField>
            <datalist id="rp-money-trips">{trips.map((t) => <option key={t.name} value={t.name} />)}</datalist>
          </FormSection>
          <FormSection title="Type and payment" description="Puts it in the right place in your accounts.">
            <FormRow>
              <FormField label="Amount" required empty={!String(form.amount).trim()} hint={errors.amount}>
                {(a) => <input {...a} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />}
              </FormField>
              <FormField label="Currency">
                {(a) => <select {...a} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
              </FormField>
            </FormRow>
            <FormField label="Reference" hint="Optional. The invoice or receipt number.">
              {(a) => <input {...a} value={form.ref} onChange={(e) => set({ ref: e.target.value })} />}
            </FormField>
          </FormSection>
          <FormSection title="Receipt" description="A photo of it fills in the details for you.">
            <button type="button" className="rp-fk-drop" onClick={() => photo.current?.click()} disabled={reading}>
              {reading ? "Reading the receipt…" : "Add a photo of the receipt"}
            </button>
            <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void readPhoto(e.target.files?.[0])} />
          </FormSection>
        </FormPage>
        {note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
        <StatusBar status={formStatus({ missing, create: true, verb: "add" })} primaryLabel="Add expense" busy={busy}
          blocked={missing > 0} onBlocked={() => setNote({ tone: "warn", text: "Fill in the highlighted fields." })}
          onPrimary={() => void submit()} onCancel={onCancel} />
      </form>
    );
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
