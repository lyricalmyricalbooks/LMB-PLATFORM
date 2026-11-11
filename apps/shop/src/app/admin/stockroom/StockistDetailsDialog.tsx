// Stockroom › Stockists: Add a stockist, or Edit a stockist's details (withStore in stockistMoves.ts), saved through the
// stockroom writer. A shop that holds several titles keeps one record per title, so an edit is saved to each of them.
import { useState } from "react";

import { Dialog, InkButton, SecondaryButton, SelectField, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import { STORE_FIELDS, storeFormOf, withStore, type StoreForm } from "./stockistMoves";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
const LABELS: Record<(typeof STORE_FIELDS)[number], string> = {
  name: "Shop name", contact: "Contact person", email: "Email", phone: "Phone", address: "Street address", city: "City",
  region: "Province or state", postal: "Postal code", country: "Country", website: "Website", terms: "Payment terms", notes: "Notes",
};

export function StockistDetailsDialog({ shop, store, bookIds, books, onClose, onBookSaved, onDone }: {
  /** The shop being edited; left out to add one. */
  shop?: string; store?: Row | null; bookIds?: string[]; books: Row[];
  onClose: () => void; onBookSaved: (bookId: string, state: Row) => void; onDone: (note: string) => void;
}) {
  const w = useShopWords();
  const adding = shop === undefined;
  const [form, setForm] = useState<StoreForm>(() => storeFormOf(store));
  const [bookId, setBookId] = useState(String(books[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (k: keyof StoreForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (busy) return;
    setBusy(true); setProblem("");
    const targets = adding ? [bookId] : bookIds || [];
    let note = "";
    try {
      for (const id of targets) {
        const r = await stockroomWriteApi.saveBookState(id, withStore(adding ? null : shop!, form));
        const d = describeResult(r);
        if (r.status !== "saved" && r.status !== "unchanged") { setProblem(d.text); setBusy(false); return; }
        note = d.text;
        onBookSaved(id, r.state as Row);
      }
      onDone(adding ? `${form.name.trim()} added. ${note}` : `Details saved. ${note}`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Nothing was saved. Try again.");
      setBusy(false);
    }
  }
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title={adding ? "Add a stockist" : "Edit details"} description={adding ? undefined : shop}
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><InkButton busy={busy} disabled={adding && !bookId} onClick={() => void save()}>{adding ? "Add stockist" : "Save"}</InkButton></>}>
      {adding && (
        <SelectField label={w("First title they'll stock")} value={bookId} onChange={(e) => setBookId(e.target.value)}>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title || b.id}</option>)}
        </SelectField>
      )}
      {STORE_FIELDS.map((k) => (
        <TextField key={k} label={LABELS[k]} type={k === "email" ? "email" : "text"} value={form[k]} onChange={(e) => set(k, e.target.value)} />
      ))}
      <TextField label="Their commission (%)" type="number" min={0} max={100} value={form.rate} onChange={(e) => set("rate", e.target.value)} />
      {problem && <p className="rp-sk-notice" data-tone="error" role="alert">{problem}</p>}
    </Dialog>
  );
}
