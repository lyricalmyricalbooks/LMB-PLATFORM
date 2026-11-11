// Tax centre › Receipts: every receipt kept in the period in one list, and the business expenses still missing one,
// each with an "Attach receipt" button (the old Tax Centre's receipts vault).
import { useState } from "react";

import { ConfirmDialog, DataTable, EmptyState, GhostButton, SectionCard, TabPanel, Tabs } from "../riso/components";
import { detachReceipt, isEditableLine, receiptsOf, receiptVault } from "./taxLedger";
import { AttachReceiptButton, defaultUpload, useLineSave, type Upload } from "./lineSave";
import type { SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
type View = "kept" | "missing";

function MissingAttach({ line, onSaved, onNote, upload }: { line: Row; onSaved: (tc: Row) => void; onNote: (n: SaveNote) => void; upload: Upload }) {
  const { busy, attach } = useLineSave(onSaved, onNote);
  return <AttachReceiptButton desc={line.desc} busy={busy} onFile={(f) => void attach(line.itemId, f, upload)} />;
}

/** A line's receipt links; on the live page a business expense also offers "Remove" for each one, after a confirm. */
function KeptReceipts({ line, onSaved, onNote }: { line: Row; onSaved?: (tc: Row) => void; onNote: (n: SaveNote) => void }) {
  const { busy, run } = useLineSave(onSaved || (() => {}), onNote);
  const [asking, setAsking] = useState<string | null>(null);
  const files = receiptsOf(line);
  const canRemove = !!onSaved && isEditableLine(line);
  const name = (i: number) => (files.length > 1 ? `Receipt ${i + 1}` : "Open");
  return (
    <span className="rp-money-line-actions">
      {files.map((u, i) => (
        <span key={u} className="rp-money-line-actions">
          <a className="rp-money-receipt" href={u} target="_blank" rel="noopener noreferrer">{name(i)}</a>
          {canRemove && <GhostButton size="sm" disabled={busy} aria-label={`Remove ${files.length > 1 ? `receipt ${i + 1}` : "the receipt"} from ${line.desc || "this expense"}`} onClick={() => setAsking(u)}>Remove</GhostButton>}
        </span>
      ))}
      {canRemove && <ConfirmDialog open={asking !== null} title="Remove this receipt?" confirmLabel="Remove receipt"
        message={`It comes off “${line.desc || "this expense"}”. The expense itself stays in your ledger.`}
        onCancel={() => setAsking(null)}
        onConfirm={() => { const u = asking!; setAsking(null); void run((tc) => detachReceipt(tc, line.itemId, u), "Receipt removed."); }} />}
    </span>
  );
}

export function ReceiptsVaultCard({ rows, money, onSaved, upload = defaultUpload }: {
  rows: Row[]; money: (n: number) => string;
  /** Present when the receipts can be changed here (the live page); the missing list then offers "Attach receipt". */
  onSaved?: (taxCenter: Row) => void;
  /** Uploads one receipt file and returns its address (tests pass a fake). */ upload?: Upload;
}) {
  const { kept, missing } = receiptVault(rows);
  const [view, setView] = useState<View>(missing.length && !kept.length ? "missing" : "kept");
  const [note, setNote] = useState<SaveNote | null>(null);
  const amount = (r: Row) => money(Number(r.baseAmount || 0));

  return (
    <SectionCard title="Receipts" description="Every receipt you kept, and the expenses still missing one." flush>
      <div className="rp-money-pad">
        <Tabs label="Receipts" idPrefix="vault-" value={view} onChange={setView}
          tabs={[{ id: "kept", label: "Kept", count: kept.length }, { id: "missing", label: "Missing", count: missing.length }]} />
      </div>
      {note && <div className="rp-money-pad"><p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p></div>}
      <TabPanel tabId="vault-kept" active={view === "kept"}>
        <DataTable stackOnPhone caption="Receipts kept" rowKey={(r) => `${r.sourceType}:${r.itemId}:${r.date}:${r.desc}`} rows={kept}
          empty={<EmptyState inline title="No receipts yet" description="Attach one to an expense and it shows up here." />}
          columns={[
            { key: "d", header: "Date", render: (r) => r.date || "-" },
            { key: "e", header: "Expense", lead: true, render: (r) => r.desc },
            { key: "a", header: "Amount", numeric: true, render: amount },
            { key: "r", header: "Receipt", render: (r) => <KeptReceipts line={r} onSaved={onSaved} onNote={setNote} /> },
          ]} />
      </TabPanel>
      <TabPanel tabId="vault-missing" active={view === "missing"}>
        <DataTable stackOnPhone caption="Expenses missing a receipt" rowKey={(r) => `${r.itemId}`} rows={missing}
          empty={<EmptyState inline title="Every expense has its receipt" />}
          columns={[
            { key: "d", header: "Date", render: (r) => r.date || "-" },
            { key: "e", header: "Expense", lead: true, render: (r) => r.desc },
            { key: "a", header: "Amount", numeric: true, render: amount },
            ...(onSaved ? [{ key: "r", header: "Receipt", render: (r: Row) => <MissingAttach line={r} onSaved={onSaved} onNote={setNote} upload={upload} /> }] : []),
          ]} />
      </TabPanel>
    </SectionCard>
  );
}
