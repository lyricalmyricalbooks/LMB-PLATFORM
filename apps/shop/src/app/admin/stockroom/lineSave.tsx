// Saving one business expense from a list row: one save at a time, and the "Attach receipt" button with its file picker.
import { useRef, useState } from "react";

import { GhostButton } from "../riso/components";
import { attachReceipt } from "./taxLedger";
import { uploadReceipt as defaultUpload } from "./receiptUpload";
import { saveTaxCenter, type SaveNote } from "./saveTaxCenter";

type Row = Record<string, any>;
export type Upload = (file: File) => Promise<string>;

/** One save at a time for a row: shows "Saving…", hands the saved Tax centre back and reports how it went. */
export function useLineSave(onSaved: (taxCenter: Row) => void, onNote: (note: SaveNote) => void) {
  const [busy, setBusy] = useState(false);

  async function run(mutate: (tc: Row | null) => Row, done: string) {
    if (busy) return;
    setBusy(true); onNote({ tone: "busy", text: "Saving…" });
    const r = await saveTaxCenter(mutate, done);
    if (r.ok && r.taxCenter) onSaved(r.taxCenter);
    onNote(r.note); setBusy(false);
  }

  async function attach(itemId: unknown, file: File | undefined, upload: Upload) {
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
    await run((tc) => attachReceipt(tc, itemId, url), "Receipt attached.");
  }

  return { busy, run, attach };
}

/** "Attach receipt": opens the file picker and uploads the photo or PDF picked onto this expense. */
export function AttachReceiptButton({ desc, busy, onFile }: { desc?: string; busy: boolean; onFile: (file: File | undefined) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <GhostButton size="sm" disabled={busy} onClick={() => picker.current?.click()}>Attach receipt</GhostButton>
      <input ref={picker} type="file" accept="image/*,application/pdf" hidden aria-label={`Receipt for ${desc || "this expense"}`}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }} />
    </>
  );
}

export { defaultUpload };
