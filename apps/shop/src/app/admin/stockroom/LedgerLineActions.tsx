// The ledger's per-line controls for a business expense: change its category, or remove it after a confirm.
import { useState } from "react";

import { ConfirmDialog, GhostButton, SelectField } from "../riso/components";
import { EXPENSE_CATEGORIES } from "./taxExpense";
import { changeCategory, removeExpense } from "./taxLedger";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
type Line = { itemId?: unknown; desc?: string; cat?: string };

export function LedgerLineActions({ line, onSaved, onNote }: { line: Line; onSaved: (taxCenter: Row) => void; onNote: (note: SaveNote) => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const cats = EXPENSE_CATEGORIES.includes(line.cat || "") || !line.cat ? EXPENSE_CATEGORIES : [line.cat!, ...EXPENSE_CATEGORIES];

  async function run(mutate: (tc: Row | null) => Row, done: string) {
    if (busy) return;
    setBusy(true); onNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    onNote(r.note); setBusy(false);
  }

  return (
    <div className="rp-money-line-actions">
      <SelectField label={`Category for ${line.desc || "this expense"}`} hideLabel value={line.cat || ""} disabled={busy}
        onChange={(e) => { const cat = e.target.value; void run((tc) => changeCategory(tc, line.itemId, cat), `Moved to ${cat}.`); }}>
        {!line.cat && <option value="">Pick a category</option>}
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </SelectField>
      <GhostButton size="sm" disabled={busy} onClick={() => setAsking(true)}>Remove</GhostButton>
      <ConfirmDialog open={asking} title="Remove this expense?" confirmLabel="Remove expense"
        message={`“${line.desc || "This expense"}” comes out of your ledger and your totals.`}
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); void run((tc) => removeExpense(tc, line.itemId), "Expense removed."); }} />
    </div>
  );
}
