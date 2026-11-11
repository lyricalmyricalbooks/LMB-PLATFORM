// Stockroom › Stockists › a shop › one title: Send copies, Record a sale, Take a return (stockistMoves.ts), saved through
// the stockroom writer. The result's state replaces the screen's copy (WRITING.md rule 5).
import { useState } from "react";

import { Dialog, InkButton, SecondaryButton, SelectField, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import { recordStoreSale, sendCopies, takeReturn } from "./stockistMoves";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
export type MoveKind = "send" | "sale" | "return";
const TITLES: Record<MoveKind, string> = { send: "Send copies", sale: "Record a sale", return: "Take a return" };
const todayIso = () => new Date().toLocaleDateString("en-CA");

export function StockistMoveDialog({ kind, shop, rate, bookId, book, onClose, onSaved }: {
  kind: MoveKind; shop: string; rate: number; bookId: string; book: Row; onClose: () => void; onSaved: (bookId: string, state: Row, note: string) => void;
}) {
  const w = useShopWords();
  const code = String(book.currency || "CAD");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [commission, setCommission] = useState(String(rate));
  const [price, setPrice] = useState(String(book.listPrice ?? ""));
  const [cur, setCur] = useState(code);
  const [fx, setFx] = useState("");
  const [paid, setPaid] = useState<"pending" | "paid">("pending");
  const [good, setGood] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function save() {
    if (busy) return;
    setBusy(true); setProblem("");
    const n = Number(qty);
    const mutate = kind === "send" ? sendCopies(book, shop, { qty: n, rate: Number(commission), date, notes })
      : kind === "sale" ? recordStoreSale(book, shop, { qty: n, unitPrice: Number(price), date, paid, notes, saleCur: cur.trim().toUpperCase() || code, fxRate: Number(fx) || undefined })
      : takeReturn(shop, { qty: n, date, good, notes });
    try {
      const r = await stockroomWriteApi.saveBookState(bookId, mutate);
      const d = describeResult(r);
      if (r.status === "saved" || r.status === "unchanged") onSaved(bookId, r.state as Row, d.text);
      else setProblem(d.text);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Nothing was saved. Try again.");
    }
    setBusy(false);
  }
  return (
    <Dialog open onClose={onClose} title={TITLES[kind]} description={`${book.title || ""} · ${shop}`}
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><InkButton busy={busy} onClick={() => void save()}>{TITLES[kind]}</InkButton></>}>
      <TextField label={w("Copies")} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {kind === "send" && <TextField label="Their commission (%)" type="number" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} />}
      {kind === "sale" && <>
        <TextField label="Price each" hint={`What they sold it for. They keep ${rate}%.`} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        <TextField label="Currency" hint={`Leave as ${code} unless they sold in another`} maxLength={3} value={cur} onChange={(e) => setCur(e.target.value)} />
        {cur.trim().toUpperCase() !== code && <TextField label={`${code} for one ${cur.trim().toUpperCase()}`} type="number" min={0} step="0.0001" value={fx} onChange={(e) => setFx(e.target.value)} />}
        <SelectField label="Paid?" value={paid} onChange={(e) => setPaid(e.target.value as "pending" | "paid")}>
          <option value="pending">Not yet: they owe it</option><option value="paid">Paid</option>
        </SelectField>
      </>}
      {kind === "return" && <SelectField label="Condition" value={good ? "good" : "bad"} onChange={(e) => setGood(e.target.value === "good")}>
        <option value="good">Good: back to stock</option><option value="bad">Damaged: write off</option>
      </SelectField>}
      <TextField label="Note" hint="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {problem && <p className="rp-sr-save" data-tone="error" role="alert">{problem}</p>}
    </Dialog>
  );
}
