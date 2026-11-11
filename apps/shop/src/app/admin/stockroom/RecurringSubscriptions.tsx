// Tax centre › Recurring subscriptions. List, add, edit, pause or resume, remove; due charges post to the ledger when the
// page opens (the stockroom's own schedule rules, idempotent through the posted-month marker).
import { useEffect, useRef, useState } from "react";
import { currentAmount, frequencyLabel, nextRecurringDate, normalizeRecurring, recurringStatus, relativeDayLabel, summarizeRecurring } from "@stockroom/recurring.js";
import { fmt } from "@stockroom/money.js";

import { ConfirmDialog, Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField } from "../riso/components";
import { baseCurrencyOf, EXPENSE_CATEGORIES, EXPENSE_CURRENCIES } from "./taxExpense";
import { blankSub, checkSub, isDuplicateSub, postDueCharges, recurringList, RECURRING_FREQUENCIES, removeSub, saveSub, subToForm, togglePause, type SubErrors, type SubForm } from "./taxRecurring";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TONE = { active: "success", scheduled: "info", paused: "neutral", ended: "neutral", invalid: "danger" } as const;
const WORD = { active: "Active", scheduled: "Scheduled", paused: "Paused", ended: "Ended", invalid: "Needs a date" } as const;

export function RecurringSubscriptionsCard({ taxCenter, onSaved, autoPost = true, now }: { taxCenter: Row | null; onSaved: (taxCenter: Row) => void; autoPost?: boolean; now?: Date }) {
  const base = baseCurrencyOf(taxCenter);
  const at = now ?? new Date();
  const subs = recurringList(taxCenter);
  const summary = summarizeRecurring(subs, (taxCenter?.settings?.rates as Record<string, number>) || {}, base, at);
  const [editing, setEditing] = useState<{ id: string | null; form: SubForm } | null>(null);
  const [errors, setErrors] = useState<SubErrors>({});
  const [asking, setAsking] = useState<Row | null>(null);
  const [dup, setDup] = useState<Row | null>(null);
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const posted = useRef(false);

  async function save(mutate: (tc: Row | null) => Row, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    setNote(r.note);
    setBusy(false);
    return r.ok;
  }

  // Charges that have come due since the page was last opened post once, here.
  useEffect(() => {
    if (!autoPost || posted.current || !subs.length) return;
    posted.current = true;
    if (!postDueCharges(taxCenter, at).posted && subs.every((s) => s.id)) return;
    void (async () => {
      let count = 0;
      const r = await saveTaxCenter((tc) => { const out = postDueCharges(tc, new Date()); count = out.posted; return out.taxCenter; }, "");
      if (r.ok && r.taxCenter) { onSaved(r.taxCenter); if (count) setNote({ tone: "ok", text: `${count} due ${count === 1 ? "charge was" : "charges were"} added to the ledger.` }); }
      else setNote(r.note);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (sub?: Row) => { setErrors({}); setDup(null); setEditing(sub ? { id: String(sub.id), form: subToForm(sub) } : { id: null, form: blankSub(base, todayText()) }); };
  const set = (patch: Partial<SubForm>) => { setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e)); setDup(null); };
  async function submit() {
    if (!editing) return;
    const checked = checkSub(editing.form);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    const clash = !dup && isDuplicateSub(taxCenter, editing.form, editing.id);
    if (clash) { setDup(clash); return; }
    const { form, id } = editing;
    const ok = await save((tc) => postDueCharges(saveSub(tc, form, id), new Date()).taxCenter, id ? "Subscription updated." : "Subscription added. Charges already due are in the ledger.");
    if (ok) setEditing(null);
  }
  const currencies = [...new Set([base, ...EXPENSE_CURRENCIES])];

  return (
    <SectionCard title="Recurring subscriptions" description={subs.length ? `About ${fmt(summary.monthlyBase, base)} a month, ${fmt(summary.annualBase, base)} a year. Each charge posts to the ledger on its day.` : "Standing costs that post themselves to the ledger each period: hosting, software, rent, phone."}
      actions={<SecondaryButton onClick={() => open()} disabled={busy}>Add subscription</SecondaryButton>} flush={subs.length > 0}>
      {subs.length === 0
        ? <EmptyState inline icon="🔁" title="No subscriptions yet" description="Add hosting, software or rent that repeats, and its charges post to the ledger for you." />
        : <ul className="rp-money-pending">
            {subs.map((raw) => {
              const s = normalizeRecurring(raw);
              const status = recurringStatus(raw, at) as keyof typeof TONE;
              const next = nextRecurringDate(raw, at);
              return (
                <li key={s.id || s.desc}>
                  <div className="rp-money-pending-main">
                    <strong>{s.desc}</strong> <StatusBadge tone={TONE[status]}>{WORD[status]}</StatusBadge>
                    <p className="rp-money-sub">{[s.vendor, s.cat, next && status !== "ended" ? `next ${relativeDayLabel(next, at).toLowerCase()} (${next})` : ""].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="rp-money-pending-amt">{fmt(currentAmount(raw, at), s.currency)} {frequencyLabel(s.frequency).toLowerCase()}</span>
                  <div className="rp-money-pending-acts">
                    <SecondaryButton size="sm" onClick={() => save((tc) => togglePause(tc, String(s.id)), s.paused ? "Resumed." : "Paused.")} disabled={busy}>{s.paused ? "Resume" : "Pause"}</SecondaryButton>
                    <GhostButton size="sm" onClick={() => open(raw)} disabled={busy}>Edit</GhostButton>
                    <GhostButton size="sm" onClick={() => setAsking(raw)} disabled={busy}>Remove</GhostButton>
                  </div>
                </li>
              );
            })}
          </ul>}
      {note && note.text && <p className="rp-sr-save rp-money-pad" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
      <Dialog open={!!editing} onClose={busy ? () => {} : () => setEditing(null)} title={editing?.id ? "Edit subscription" : "Add a subscription"}
        footer={<><SecondaryButton onClick={() => setEditing(null)} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={submit} busy={busy}>{busy ? "Saving…" : dup ? "Add anyway" : "Save"}</PrimaryButton></>}>
        {editing && (
          <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <TextField label="What is it?" placeholder="e.g. Hosting" value={editing.form.desc} error={errors.desc} onChange={(e) => set({ desc: e.target.value })} />
            <div className="rp-money-form-row">
              <TextField label="Shop or company (optional)" value={editing.form.vendor} onChange={(e) => set({ vendor: e.target.value })} />
              <SelectField label="Tax category" value={editing.form.cat} onChange={(e) => set({ cat: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField>
            </div>
            <div className="rp-money-form-row">
              <SelectField label="Currency" value={editing.form.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField>
              <TextField label="Amount of one charge" type="number" inputMode="decimal" min={0} step="0.01" value={editing.form.amount} error={errors.amount} onChange={(e) => set({ amount: e.target.value })} />
            </div>
            <div className="rp-money-form-row">
              <SelectField label="How often" value={editing.form.frequency} onChange={(e) => set({ frequency: e.target.value })}>{RECURRING_FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</SelectField>
              <TextField label="First charge" type="date" value={editing.form.startDate} error={errors.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <TextField label="Ends on (optional)" type="date" value={editing.form.endDate} error={errors.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            <TextArea label="Note (optional)" rows={2} value={editing.form.notes} onChange={(e) => set({ notes: e.target.value })} />
            {dup && <p className="rp-money-note" role="status">“{dup.desc}” is already tracked ({fmt(currentAmount(dup, at), dup.currency || base)} {frequencyLabel(dup.frequency).toLowerCase()}). Both would post charges. Tap Add anyway to keep both.</p>}
            <button type="submit" hidden />
          </form>
        )}
        {note?.tone === "error" && <p className="rp-sr-save" data-tone="error" role="alert">{note.text}</p>}
      </Dialog>
      <ConfirmDialog open={!!asking} title="Remove this subscription?" confirmLabel="Remove" message={asking ? `“${asking.desc}” stops posting charges. Charges already in the ledger stay.` : ""}
        onCancel={() => setAsking(null)} onConfirm={async () => { const id = String(asking!.id); setAsking(null); await save((tc) => removeSub(tc, id), "Subscription removed."); }} />
    </SectionCard>
  );
}
