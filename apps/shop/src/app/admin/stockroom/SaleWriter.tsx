// Record a sale and void one, for the Sales records page. Every save goes through `stockroomWriteApi.saveBookState`
// (WRITING.md); the rules are in recordSale.ts. Every result is shown: saving, saved, saved with a conflict, refused,
// and failed (offered again, and tried again by itself when the connection comes back).
import { useEffect, useRef, useState } from "react";

import { Dialog, PrimaryButton, SecondaryButton, DestructiveButton, SelectField, TextArea, TextField, ConfirmDialog } from "../riso/components";
import { useShopWords } from "../shopWords";
import { addSale, blankSale, checkSale, newSaleId, priceOf, SALE_CHANNELS, SaleRefusal, voidBlock, voidSale, type SaleForm, type SaleFormErrors } from "./recordSale";
import type { StockroomRecords } from "./stockroomData";
import { describeResult, stockroomWriteApi, type BookSaveResult, type PendingBookSave } from "./stockroomWrite";
import type { BookState } from "./planSave";

export type SaveNote = { tone: "busy" | "ok" | "warn" | "error"; text: string; retry?: () => void };

/** Retryable failures: the change is kept and can be sent again. */
const RETRYABLE = new Set(["offline", "read-failed", "write-failed"]);

/**
 * One save at a time, with its result as a note. `run` returns true when the records changed (saved or unchanged).
 * A failed save that can be tried again keeps its prepared change and sends it again when the browser is back online.
 */
export function useStockroomSave(onState: (bookId: string, state: BookState) => void) {
  const [note, setNote] = useState<SaveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ bookId: string; save: PendingBookSave; done: string } | null>(null);

  const settle = (bookId: string, result: BookSaveResult, done: string): boolean => {
    if (result.status === "saved" || result.status === "unchanged") {
      pending.current = null;
      onState(bookId, result.state);
      const d = describeResult(result);
      setNote({ tone: d.tone === "warn" ? "warn" : "ok", text: d.tone === "warn" ? `${done} ${d.text}` : result.merged ? `${done} ${d.text}` : done });
      return true;
    }
    if (result.status === "failed" && RETRYABLE.has(result.reason) && result.pending) {
      pending.current = { bookId, save: result.pending, done };
      setNote({ tone: "error", text: `${result.message} It will be tried again when you're back online.`, retry });
      return false;
    }
    pending.current = null;
    setNote({ tone: "error", text: describeResult(result).text });
    return false;
  };

  async function retry() {
    const kept = pending.current;
    if (!kept || busy) return;
    setBusy(true);
    setNote({ tone: "busy", text: "Trying again…" });
    try { settle(kept.bookId, await stockroomWriteApi.commitBookState(kept.save), kept.done); }
    catch (error) { console.error("Stockroom save failed", error); setNote({ tone: "error", text: "That didn't save. Nothing was changed.", retry }); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const back = () => { if (pending.current) void retry(); };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  });

  async function run(bookId: string, mutate: (s: BookState) => BookState, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNote({ tone: "busy", text: "Saving…" });
    try {
      return settle(bookId, await stockroomWriteApi.saveBookState(bookId, mutate), done);
    } catch (error) {
      pending.current = null;
      if (error instanceof SaleRefusal) setNote({ tone: "error", text: error.message });
      else { console.error("Stockroom save failed", error); setNote({ tone: "error", text: "That didn't save. Nothing was changed." }); }
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { note, busy, run, clear: () => setNote(null) };
}

export function SaveNoteLine({ note }: { note: SaveNote | null }) {
  if (!note) return null;
  return (
    <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>
      <span>{note.text}</span>
      {note.retry && <SecondaryButton size="sm" onClick={note.retry}>Try again</SecondaryButton>}
    </p>
  );
}

export function RecordSaleDialog({ open, onClose, records, save }: {
  open: boolean; onClose: () => void; records: StockroomRecords; save: ReturnType<typeof useStockroomSave>;
}) {
  const w = useShopWords();
  const books = records.books;
  const [form, setForm] = useState<SaleForm>(() => blankSale(books));
  const [errors, setErrors] = useState<SaleFormErrors>({});
  // One id per sale being typed: a second tap or a retry can't add it twice.
  const id = useRef(newSaleId());
  useEffect(() => { if (open) { setForm(blankSale(books)); setErrors({}); id.current = newSaleId(); } }, [open]);

  const set = (patch: Partial<SaleForm>) => setForm((f) => ({ ...f, ...patch }));
  const onHand = (bookId: string) => { const n = Number(records.states[bookId]?.stock); return Number.isFinite(n) ? n : null; };
  const book = books.find((b) => b.id === form.bookId);

  async function submit() {
    const checked = checkSale(form, books, w, book && Number.isFinite(book.maxPrint as number) ? onHand(form.bookId) : null);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    const ok = await save.run(checked.sale.bookId, addSale(checked.sale, book!, id.current, w), `Sale recorded: ${checked.sale.qty} × ${book!.title}.`);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onClose={save.busy ? () => {} : onClose} title="Record a sale" description={w("Copies sold by hand, at a fair or anywhere the stockroom didn't see.")}
      footer={<>
        <SecondaryButton onClick={onClose} disabled={save.busy}>Cancel</SecondaryButton>
        <PrimaryButton onClick={submit} busy={save.busy}>{save.busy ? "Saving…" : "Record sale"}</PrimaryButton>
      </>}>
      <form className="rp-sr-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <SelectField label={w("Book")} value={form.bookId} error={errors.bookId}
          onChange={(e) => { const b = books.find((x) => x.id === e.target.value); set({ bookId: e.target.value, price: form.price || priceOf(b) }); }}>
          <option value="">{w("Choose a book")}</option>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title}{onHand(b.id) != null ? ` (${onHand(b.id)} on hand)` : ""}</option>)}
        </SelectField>
        <div className="rp-sr-form-row">
          <TextField label={w("Copies")} type="number" inputMode="numeric" min={1} step={1} value={form.qty} error={errors.qty} onChange={(e) => set({ qty: e.target.value })} />
          <TextField label="Price each" type="number" inputMode="decimal" min={0} step="0.01" value={form.price} error={errors.price} onChange={(e) => set({ price: e.target.value })} />
        </div>
        <div className="rp-sr-form-row">
          <SelectField label="Channel" value={form.chan} error={errors.chan} onChange={(e) => set({ chan: e.target.value })}>
            {SALE_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectField>
          <TextField label="Date" type="date" value={form.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <TextField label="Order number (optional)" value={form.num} error={errors.num} onChange={(e) => set({ num: e.target.value })} />
        <TextArea label="Note (optional)" rows={2} value={form.notes} error={errors.notes} onChange={(e) => set({ notes: e.target.value })} />
        <button type="submit" hidden />
      </form>
      <SaveNoteLine note={save.note?.tone === "error" || save.note?.tone === "busy" ? save.note : null} />
    </Dialog>
  );
}

/** The drawer's Void button and its confirm. Hidden for a sale that can't be voided here, with the reason. */
export function VoidSaleAction({ raw, bookId, title, save, onDone }: {
  raw: Record<string, unknown>; bookId: string; title: string; save: ReturnType<typeof useStockroomSave>; onDone: () => void;
}) {
  const w = useShopWords();
  const [asking, setAsking] = useState(false);
  const blocked = voidBlock(raw, w);
  if (raw.voided) return null;
  if (blocked) return <p className="rp-sr-note">{blocked}</p>;
  return (
    <>
      <DestructiveButton busy={save.busy} onClick={() => setAsking(true)}>Void this sale</DestructiveButton>
      <ConfirmDialog open={asking} title="Void this sale?" confirmLabel="Void sale"
        message={w(`The sale stays on record, marked voided. Its copies go back on hand and its money leaves every total for ${title}.`)}
        onCancel={() => setAsking(false)}
        onConfirm={async () => { setAsking(false); if (await save.run(bookId, voidSale(raw, w), "Sale voided.")) onDone(); }} />
    </>
  );
}
