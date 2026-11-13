// Stockroom › QR codes › Hang tags: pick the items, how many tags of each, and print the tag sheet (the old stockroom's
// own hang-tags.js: title, maker, price and ISBN, eight to a page). Nothing is saved.
import { useState } from "react";
import { getSym } from "@stockroom/money.js";
import { hangTagsHtml } from "@stockroom/hang-tags.js";

import { Checkbox, Dialog, PrimaryButton, SecondaryButton, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { StockroomRecords } from "./stockroomData";
import { SHOP_CURRENCY } from "../moneySign";

type Row = Record<string, any>;

/** One tag's facts from a stockroom book: its list price in its own currency, or a blank to write in. Pure. */
export function tagBook(b: Row): { title: string; author: string; price: number | ""; currency: string; isbn: string } {
  const price = Number(b.listPrice);
  return { title: String(b.title || ""), author: String(b.author || ""), price: Number.isFinite(price) && price > 0 ? price : "", currency: getSym(String(b.currency || SHOP_CURRENCY)), isbn: String(b.isbn || "") };
}

export function HangTagsDialog({ records, onClose }: { records: StockroomRecords; onClose: () => void }) {
  const w = useShopWords();
  const books = records.books.filter((b) => !b.isTest) as Row[];
  const [event, setEvent] = useState("");
  const [copies, setCopies] = useState("1");
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(books.map((b) => [b.id, true])));
  const [error, setError] = useState("");

  function print() {
    const chosen = books.filter((b) => picked[b.id]).map(tagBook);
    if (!chosen.length) { setError(w("Pick at least one book.")); return; }
    const sheet = window.open("", "_blank");
    if (!sheet) { setError("Your browser blocked the print window. Allow pop-ups for this page."); return; }
    sheet.document.write(hangTagsHtml({ books: chosen, copies: Number(copies) || 1, eventName: event.trim() }));
    sheet.document.close();
    onClose();
  }

  const all = books.every((b) => picked[b.id]);
  return (
    <Dialog open onClose={onClose} title="Hang tags" description="Small price tags to cut out, eight to a page."
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={print}>Print</PrimaryButton></>}>
      <TextField label="Event" hint="Optional, printed small on each tag" value={event} onChange={(e) => setEvent(e.target.value)} />
      <TextField label="Tags of each" type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(e.target.value)} />
      <Checkbox label={w("All books")} checked={all} onChange={(e) => setPicked(Object.fromEntries(books.map((b) => [b.id, e.target.checked])))} />
      <ul className="rp-sr-list">{books.map((b) => (
        <li key={b.id}><Checkbox label={String(b.title || "Untitled")} checked={!!picked[b.id]} onChange={(e) => setPicked((p) => ({ ...p, [b.id]: e.target.checked }))} /></li>
      ))}</ul>
      {error && <p className="rp-sr-save" data-tone="error" role="alert">{error}</p>}
    </Dialog>
  );
}
