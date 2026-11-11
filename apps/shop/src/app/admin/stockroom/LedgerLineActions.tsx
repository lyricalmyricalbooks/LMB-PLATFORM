// The ledger's per-line controls for a business expense: change its category, attach a receipt, or remove it after a confirm.
import { useState } from "react";

import { ConfirmDialog, GhostButton, SelectField } from "../riso/components";
import { EXPENSE_CATEGORIES } from "./taxExpense";
import { changeCategory, receiptsOf, removeExpense } from "./taxLedger";
import { AttachReceiptButton, defaultUpload, useLineSave, type Upload } from "./lineSave";
import type { SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
type Line = { itemId?: unknown; desc?: string; cat?: string; receipt?: unknown; receiptFiles?: unknown; receiptExempt?: boolean };

export function LedgerLineActions({ line, onSaved, onNote, upload = defaultUpload }: {
  line: Line; onSaved: (taxCenter: Row) => void; onNote: (note: SaveNote) => void;
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
      <GhostButton size="sm" disabled={busy} onClick={() => setAsking(true)}>Remove</GhostButton>
      <ConfirmDialog open={asking} title="Remove this expense?" confirmLabel="Remove expense"
        message={`“${line.desc || "This expense"}” comes out of your ledger and your totals.`}
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); void run((tc) => removeExpense(tc, line.itemId), "Expense removed."); }} />
    </div>
  );
}
