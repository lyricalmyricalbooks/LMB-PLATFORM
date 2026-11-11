// Stockroom › QR codes › Tally sheet: pick the titles going to a fair, how many are packed, and print the paper
// tally sheet (tallySheet.ts). Nothing is saved: it is a sheet for the table.
import { useState } from "react";
import { getSym } from "@stockroom/money.js";

import { Checkbox, Dialog, PrimaryButton, SecondaryButton, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import { todayText } from "./invoiceMake";
import type { StockroomRecords } from "./stockroomData";
import { tallySheetHtml } from "./tallySheet";

export function TallySheetDialog({ records, onClose }: { records: StockroomRecords; onClose: () => void }) {
  const w = useShopWords();
  const books = records.books.filter((b) => !b.isTest);
  const [event, setEvent] = useState("");
  const [date, setDate] = useState(todayText());
  const [cols, setCols] = useState("10");
  const [notes, setNotes] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(books.map((b) => [b.id, true])));
  const [packed, setPacked] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function print() {
    const rows = books.filter((b) => picked[b.id]).map((b) => ({ title: String(b.title || ""), author: String(b.author || ""), qty: Math.max(0, parseInt(packed[b.id] || "", 10) || 0) }));
    if (!rows.length) { setError(w("Pick at least one book.")); return; }
    const sheet = window.open("", "_blank");
    if (!sheet) { setError("Your browser blocked the print window. Allow pop-ups for this page."); return; }
    const cur = String(books.find((b) => picked[b.id])?.currency || "CAD");
    sheet.document.write(tallySheetHtml({ event: event.trim(), date, cols: Number(cols), notes, currencySymbol: getSym(cur), rows, heading: w("Book Sales Tracker"), titleHeading: w("Book title") }));
    sheet.document.close();
    onClose();
  }

  const all = books.every((b) => picked[b.id]);
  return (
    <Dialog open onClose={onClose} title="Tally sheet" description="A paper sheet for a fair: tick a box for each sale, add them up at the end."
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={print}>Print</PrimaryButton></>}>
      <TextField label="Event" hint="Optional" value={event} onChange={(e) => setEvent(e.target.value)} />
      <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <TextField label="Boxes per row" type="number" min={1} max={30} value={cols} onChange={(e) => setCols(e.target.value)} />
      <Checkbox label="Add a row to write each price paid" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
      <Checkbox label={w("All books")} checked={all} onChange={(e) => setPicked(Object.fromEntries(books.map((b) => [b.id, e.target.checked])))} />
      <ul className="rp-sr-list">{books.map((b) => (
        <li key={b.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Checkbox label={String(b.title || "Untitled")} checked={!!picked[b.id]} onChange={(e) => setPicked((p) => ({ ...p, [b.id]: e.target.checked }))} />
          <TextField label="Packed" hideLabel placeholder="Packed" type="number" min={0} value={packed[b.id] || ""} disabled={!picked[b.id]}
            onChange={(e) => setPacked((p) => ({ ...p, [b.id]: e.target.value }))} style={{ width: 90 }} />
        </li>))}</ul>
      {error && <p className="rp-sr-save" data-tone="error" role="alert">{error}</p>}
    </Dialog>
  );
}
