// Tax centre › Pending & to confirm. Add, edit, snooze, delete and confirm notes about costs still to come. Every save goes
// through `stockroomWriteApi.updateSetting("taxCenter", …)` (WRITING.md); the result is always shown.
import { useRef, useState } from "react";

import { ConfirmDialog, Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField } from "../riso/components";
import { fmt } from "@stockroom/money.js";
import { baseCurrencyOf, EXPENSE_CATEGORIES, EXPENSE_CURRENCIES } from "./taxExpense";
import { blankPending, checkPending, confirmPrefill, deletePending, pendingList, pendingToForm, savePending, snoozePending, sortedPending, type PendingErrors, type PendingForm } from "./taxPending";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import type { Prefill } from "./LogExpense";

type Row = Record<string, any>;
type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TONE = { overdue: "danger", today: "warning", soon: "info", later: "neutral", none: "neutral" } as const;

export function PendingExpensesCard({ taxCenter, onSaved, onConfirm, today = todayText() }: { taxCenter: Row | null; onSaved: (taxCenter: Row) => void; onConfirm: (prefill: Prefill) => void; today?: string }) {
  const base = baseCurrencyOf(taxCenter);
  const rows = sortedPending(taxCenter, today);
  const [editing, setEditing] = useState<{ id: number; form: PendingForm } | null>(null);
  const [errors, setErrors] = useState<PendingErrors>({});
  const [asking, setAsking] = useState<Row | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(Date.now());

  async function save(mutate: (tc: Row | null) => Row, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNote({ tone: "busy", text: "Saving…" });
    try {
      const result = await stockroomWriteApi.updateSetting("taxCenter", (current) => mutate(current as Row | null));
      if (result.status === "saved" || result.status === "unchanged") {
        onSaved((result.value as Row) || {});
        const d = describeResult(result);
        setNote({ tone: d.tone, text: d.tone === "ok" && !result.merged ? done : d.text });
        return true;
      }
      setNote({ tone: "error", text: describeResult(result).text });
    } catch (error) {
      console.error("Tax centre save failed", error);
      setNote({ tone: "error", text: "That didn't save. Nothing was changed." });
    } finally { setBusy(false); }
    return false;
  }

  const open = (item?: Row) => { setErrors({}); setEditing(item ? { id: item.id, form: pendingToForm(item) } : { id: (nextId.current = Date.now()), form: blankPending(base) }); };
  const set = (patch: Partial<PendingForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  async function submit() {
    if (!editing) return;
    const checked = checkPending(editing.form);
    if (!checked.ok) { setErrors(checked.errors); return; }
    const { id, form } = editing;
    if (await save((tc) => savePending(tc, form, id, todayText()), "Noted. It waits here until you confirm it.")) setEditing(null);
  }
  const currencies = [...new Set([base, ...EXPENSE_CURRENCIES])];

  return (
    <SectionCard title="Pending & to confirm" description="Costs you know about but can't log yet: no amount, no receipt, no final date. They stay out of your totals until you confirm them."
      actions={<SecondaryButton onClick={() => open()} disabled={busy}>Note a pending expense</SecondaryButton>} flush={rows.length > 0}>
      {rows.length === 0
        ? <EmptyState inline icon="🕒" title="Nothing pending" description="Note a cost you expect, like flights for a fair, and confirm it once you have the amount." />
        : <ul className="rp-money-pending">
            {rows.map(({ item, due }) => (
              <li key={item.id}>
                <div className="rp-money-pending-main">
                  <strong>{item.desc}</strong> <StatusBadge tone={TONE[due.state]} glyph={false}>{due.label}</StatusBadge>
                  <p className="rp-money-sub">{[item.cat, item.trip, item.expectedDate && `expected ${item.expectedDate}`].filter(Boolean).join(" · ")}{item.note ? ` · ${item.note}` : ""}</p>
                </div>
                <span className="rp-money-pending-amt">{item.estAmount ? `about ${fmt(item.estAmount, item.currency || base)}` : "Amount unknown"}</span>
                <div className="rp-money-pending-acts">
                  <PrimaryButton size="sm" onClick={() => onConfirm({ noteId: item.id, form: confirmPrefill(item, today) })} disabled={busy}>Confirm & log</PrimaryButton>
                  <SecondaryButton size="sm" onClick={() => save((tc) => snoozePending(tc, item.id, 7, todayText()), "Reminder moved a week on.")} disabled={busy}>+1 week</SecondaryButton>
                  <GhostButton size="sm" onClick={() => open(item)} disabled={busy}>Edit</GhostButton>
                  <GhostButton size="sm" onClick={() => setAsking(item)} disabled={busy}>Delete</GhostButton>
                </div>
              </li>
            ))}
          </ul>}
      {note && <p className="rp-sr-save rp-money-pad" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
      <Dialog open={!!editing} onClose={busy ? () => {} : () => setEditing(null)} title={editing && pendingList(taxCenter).some((p) => String(p.id) === String(editing.id)) ? "Edit pending expense" : "Note a pending expense"}
        footer={<><SecondaryButton onClick={() => setEditing(null)} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={submit} busy={busy}>{busy ? "Saving…" : "Save note"}</PrimaryButton></>}>
        {editing && (
          <form className="rp-money-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <TextField label="What is it?" placeholder="e.g. Flights to the book fair" value={editing.form.desc} error={errors.desc} onChange={(e) => set({ desc: e.target.value })} />
            <div className="rp-money-form-row">
              <SelectField label="Tax category" value={editing.form.cat} onChange={(e) => set({ cat: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField>
              <TextField label="Trip or project (optional)" value={editing.form.trip} onChange={(e) => set({ trip: e.target.value })} />
            </div>
            <div className="rp-money-form-row">
              <SelectField label="Currency" value={editing.form.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField>
              <TextField label="Estimated amount (optional)" type="number" inputMode="decimal" min={0} step="0.01" value={editing.form.estAmount} error={errors.estAmount} onChange={(e) => set({ estAmount: e.target.value })} />
            </div>
            <div className="rp-money-form-row">
              <TextField label="Expected date (optional)" type="date" value={editing.form.expectedDate} onChange={(e) => set({ expectedDate: e.target.value })} />
              <TextField label="Remind me on (optional)" type="date" value={editing.form.remindOn} onChange={(e) => set({ remindOn: e.target.value })} />
            </div>
            <TextArea label="Note (optional)" rows={2} value={editing.form.note} onChange={(e) => set({ note: e.target.value })} />
            <button type="submit" hidden />
          </form>
        )}
        {note?.tone === "error" && <p className="rp-sr-save" data-tone="error" role="alert">{note.text}</p>}
      </Dialog>
      <ConfirmDialog open={!!asking} title="Delete this note?" confirmLabel="Delete note" message={asking ? `“${asking.desc}” will be removed. Nothing in your ledger changes.` : ""}
        onCancel={() => setAsking(null)} onConfirm={async () => { const id = asking!.id; setAsking(null); await save((tc) => deletePending(tc, id), "Note deleted."); }} />
    </SectionCard>
  );
}
