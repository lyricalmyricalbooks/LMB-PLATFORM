// Stockroom › Stock › one item › Places: where the press's own copies sit (a studio, a market stall), with Move copies
// and Close a place. The rules are the old stockroom's (stockPlaces.ts); saving goes through stockroomWrite.ts.
import { useState } from "react";

import { placeCounts } from "@stockroom/stock-places.js";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, TextField } from "../riso/components";
import { closePlace, moveCopies } from "./stockPlaces";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
const NEW = "__new";

export function PlacesCard({ bookId, book, state, onSaved }: { bookId: string; book: Row | null; state: Row; onSaved: () => void }) {
  const counts = placeCounts(state, book);
  const [moving, setMoving] = useState(false);
  const [from, setFrom] = useState("Main");
  const [to, setTo] = useState(NEW);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);

  async function save(mutate: (s: Row) => Row, done: () => void) {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await stockroomWriteApi.saveBookState(bookId, mutate);
      const d = describeResult(r);
      setMsg(d);
      if (r.status === "saved" || r.status === "unchanged") { done(); onSaved(); }
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Nothing was saved. Try again." });
    }
    setBusy(false);
  }
  const target = to === NEW ? name : to;
  const submit = () => void save(moveCopies(book, { from, to: target, qty: Number(qty), note }), () => setMoving(false));

  return (
    <SectionCard title="Places" description="Where your own copies are kept."
      actions={<SecondaryButton size="sm" disabled={busy} onClick={() => { setMsg(null); setMoving(true); }}>Move copies</SecondaryButton>}>
      <ul className="rp-stock-places">
        {counts.map((p) => (
          <li key={p.name}>
            <strong>{p.name}</strong> <span>{p.qty.toLocaleString("en-US")}</span>
            {p.name !== "Main" && <GhostButton size="sm" disabled={busy} onClick={() => void save(closePlace(book, p.name), () => {})}>Close</GhostButton>}
          </li>
        ))}
      </ul>
      {msg && !moving && <p className="rp-sr-save" data-tone={msg.tone} role={msg.tone === "error" ? "alert" : "status"}>{msg.text}</p>}
      {moving && (
        <Dialog open onClose={() => setMoving(false)} title="Move copies"
          footer={<><SecondaryButton onClick={() => setMoving(false)}>Cancel</SecondaryButton><PrimaryButton busy={busy} disabled={busy || !target.trim()} onClick={submit}>Move</PrimaryButton></>}>
          <SelectField label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
            {counts.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.qty})</option>)}
          </SelectField>
          <SelectField label="To" value={to} onChange={(e) => setTo(e.target.value)}>
            {counts.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            <option value={NEW}>A new place…</option>
          </SelectField>
          {to === NEW && <TextField label="New place" placeholder="Market stall" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}
          <TextField label="Copies" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          <TextField label="Note" hint="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          {msg && <p className="rp-sr-save" data-tone={msg.tone} role={msg.tone === "error" ? "alert" : "status"}>{msg.text}</p>}
        </Dialog>
      )}
    </SectionCard>
  );
}
