// Stockroom › QR codes › Tally sheet: pick the titles going to a fair, how many are packed, and print the paper
// tally sheet (tallySheet.ts). A setup can be saved as a packing list on this device (the old app's fair presets, same
// list), to bring back for the next fair.
import { useState } from "react";
import { getSym } from "@stockroom/money.js";
import { loadStPresets, removeStPreset, saveStPresets, stPresetMissingBooks, stPresetSummary, upsertStPreset, type StPreset } from "@stockroom/sales-tracker-presets.js";

import { Checkbox, Dialog, GhostButton, PrimaryButton, SecondaryButton, SelectField, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import { todayText } from "./invoiceMake";
import type { StockroomRecords } from "./stockroomData";
import { tallySheetHtml } from "./tallySheet";
import { SHOP_CURRENCY } from "../moneySign";

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
  const store = (() => { try { return window.localStorage; } catch { return null; } })();
  const [lists, setLists] = useState<StPreset[]>(() => loadStPresets(store));
  const [listName, setListName] = useState("");
  const [listNote, setListNote] = useState("");
  const cur = String(books.find((b) => picked[b.id])?.currency || books[0]?.currency || SHOP_CURRENCY);

  function openList(id: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    setPicked(Object.fromEntries(books.map((b) => [b.id, list.bookIds.includes(b.id)])));
    setPacked(Object.fromEntries(Object.entries(list.qtyBrought).map(([k, n]) => [k, String(n)])));
    setCols(String(list.cols)); setNotes(list.includeNotes); setListName(list.name);
    const gone = stPresetMissingBooks(list, books.map((b) => b.id)).length;
    setListNote(gone ? w(`Opened “${list.name}”. ${gone} of its books are no longer in the stockroom.`) : `Opened “${list.name}”.`);
  }
  function saveList() {
    const name = listName.trim();
    if (!name) { setListNote("Give the list a name first."); return; }
    const bookIds = books.filter((b) => picked[b.id]).map((b) => b.id);
    const qtyBrought = Object.fromEntries(bookIds.map((id) => [id, parseInt(packed[id] || "", 10) || 0]).filter(([, n]) => (n as number) > 0));
    setLists(saveStPresets(store, upsertStPreset(lists, { name, cols: Number(cols), currencyCode: cur.length === 3 ? cur : SHOP_CURRENCY, includeNotes: notes, bookIds, qtyBrought, customBooks: [], savedAt: new Date().toISOString() })));
    setListNote(`Saved “${name}” on this device.`);
  }

  function print() {
    const rows = books.filter((b) => picked[b.id]).map((b) => ({ title: String(b.title || ""), author: String(b.author || ""), qty: Math.max(0, parseInt(packed[b.id] || "", 10) || 0) }));
    if (!rows.length) { setError(w("Pick at least one book.")); return; }
    const sheet = window.open("", "_blank");
    if (!sheet) { setError("Your browser blocked the print window. Allow pop-ups for this page."); return; }
    sheet.document.write(tallySheetHtml({ event: event.trim(), date, cols: Number(cols), notes, currencySymbol: getSym(cur), rows, heading: w("Book Sales Tracker"), titleHeading: w("Book title") }));
    sheet.document.close();
    onClose();
  }

  const all = books.every((b) => picked[b.id]);
  return (
    <Dialog open onClose={onClose} title="Tally sheet" description="A paper sheet for a fair: tick a box for each sale, add them up at the end."
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={print}>Print</PrimaryButton></>}>
      {lists.length > 0 && (
        <SelectField label="Packing list" value="" onChange={(e) => openList(e.target.value)}>
          <option value="">Start from a saved list…</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name} · {stPresetSummary(l)}</option>)}
        </SelectField>
      )}
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
      <div className="rp-money-form-row">
        <TextField label="Save as a packing list" hint="Kept on this device for the next fair" placeholder="e.g. Summer market" value={listName} onChange={(e) => setListName(e.target.value)} />
        <SecondaryButton onClick={saveList}>Save list</SecondaryButton>
        {lists.some((l) => l.name === listName.trim()) && <GhostButton onClick={() => { const id = lists.find((l) => l.name === listName.trim())!.id; setLists(saveStPresets(store, removeStPreset(lists, id))); setListNote("List removed."); }}>Remove list</GhostButton>}
      </div>
      {listNote && <p className="rp-sr-save" role="status">{listNote}</p>}
      {error && <p className="rp-sr-save" data-tone="error" role="alert">{error}</p>}
    </Dialog>
  );
}
