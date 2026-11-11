// The ledger's per-line controls for a business expense: change its category, or remove it after a confirm.
import { useRef, useState } from "react";

import { ConfirmDialog, GhostButton, SelectField } from "../riso/components";
import { EXPENSE_CATEGORIES } from "./taxExpense";
import { attachReceipt, changeCategory, receiptsOf, removeExpense } from "./taxLedger";
import { uploadReceipt as defaultUpload } from "./receiptUpload";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
type Line = { itemId?: unknown; desc?: string; cat?: string; receipt?: unknown; receiptFiles?: unknown; receiptExempt?: boolean };

export function LedgerLineActions({ line, onSaved, onNote, upload = defaultUpload }: {
  line: Line; onSaved: (taxCenter: Row) => void; onNote: (note: SaveNote) => void;
  /** Uploads one receipt file and returns its address (tests pass a fake). */ upload?: (file: File) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const receipts = receiptsOf(line);
  const [asking, setAsking] = useState(false);
  const cats = EXPENSE_CATEGORIES.includes(line.cat || "") || !line.cat ? EXPENSE_CATEGORIES : [line.cat!, ...EXPENSE_CATEGORIES];

  async function run(mutate: (tc: Row | null) => Row, done: string) {
    if (busy) return;
    setBusy(true); onNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    onNote(r.note); setBusy(false);
  }

  async function attach(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true); onNote({ tone: "busy", text: "Uploading the receipt…" });
    let url: string;
    try { url = await upload(file); }
    catch (error) {
      setBusy(false);
      onNote({ tone: "error", text: error instanceof Error && /photo or a PDF|15 MB/.test(error.message) ? error.message : "The receipt didn't upload. Check your connection and try again." });
      return;
    }
    setBusy(false);
    await run((tc) => attachReceipt(tc, line.itemId, url), "Receipt attached.");
  }

  return (
    <div className="rp-money-line-actions">
      <SelectField label={`Category for ${line.desc || "this expense"}`} hideLabel value={line.cat || ""} disabled={busy}
        onChange={(e) => { const cat = e.target.value; void run((tc) => changeCategory(tc, line.itemId, cat), `Moved to ${cat}.`); }}>
        {!line.cat && <option value="">Pick a category</option>}
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </SelectField>
      {receipts.length > 0
        ? <a className="rp-money-receipt" href={receipts[0]} target="_blank" rel="noopener noreferrer">{receipts.length > 1 ? `Receipts (${receipts.length})` : "Receipt"}</a>
        : !line.receiptExempt && <GhostButton size="sm" disabled={busy} onClick={() => picker.current?.click()}>Attach receipt</GhostButton>}
      <input ref={picker} type="file" accept="image/*,application/pdf" hidden aria-label={`Receipt for ${line.desc || "this expense"}`}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void attach(f); }} />
      <GhostButton size="sm" disabled={busy} onClick={() => setAsking(true)}>Remove</GhostButton>
      <ConfirmDialog open={asking} title="Remove this expense?" confirmLabel="Remove expense"
        message={`“${line.desc || "This expense"}” comes out of your ledger and your totals.`}
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); void run((tc) => removeExpense(tc, line.itemId), "Expense removed."); }} />
    </div>
  );
}
