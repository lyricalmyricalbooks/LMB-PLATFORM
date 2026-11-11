// Stockroom › Stock › one book › Copies with the author: hand copies to the author or take them back (authorCopies.ts).
// Shown only to shops that sell books (hasPublisherTools), or when the records already hold author copies.
import { useState } from "react";

import { deriveStockBreakdown } from "@stockroom/inventory.js";
import { Dialog, PrimaryButton, SecondaryButton, SectionCard, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import { moveAuthorCopies } from "./authorCopies";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;

export function AuthorCopiesCard({ bookId, book, state, onSaved }: { bookId: string; book: Row | null; state: Row; onSaved: () => void }) {
  const w = useShopWords();
  const b = deriveStockBreakdown(state as any, book as any);
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await stockroomWriteApi.saveBookState(bookId, moveAuthorCopies(book, dir * Number(qty), note));
      setMsg(describeResult(r));
      if (r.status === "saved" || r.status === "unchanged") { setDir(0); onSaved(); }
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Nothing was saved. Try again." });
    }
    setBusy(false);
  }
  const open = (d: 1 | -1) => { setMsg(null); setQty("1"); setNote(""); setDir(d); };
  return (
    <SectionCard title={w("Copies with the author")} description={`${b.authorHeld.toLocaleString("en-US")} with the ${w("author")}, ${b.publisherOnHand.toLocaleString("en-US")} with you.`}
      actions={<><SecondaryButton size="sm" disabled={busy || !b.publisherOnHand} onClick={() => open(1)}>Hand over</SecondaryButton>
        <SecondaryButton size="sm" disabled={busy || !b.authorHeld} onClick={() => open(-1)}>Take back</SecondaryButton></>}>
      {msg && !dir && <p className="rp-sr-save" data-tone={msg.tone} role={msg.tone === "error" ? "alert" : "status"}>{msg.text}</p>}
      {dir !== 0 && (
        <Dialog open onClose={() => setDir(0)} title={dir > 0 ? w("Hand copies to the author") : w("Take copies back from the author")}
          footer={<><SecondaryButton onClick={() => setDir(0)}>Cancel</SecondaryButton><PrimaryButton busy={busy} onClick={() => void submit()}>{dir > 0 ? "Hand over" : "Take back"}</PrimaryButton></>}>
          <TextField label="Copies" type="number" min={1} max={dir > 0 ? b.publisherOnHand : b.authorHeld} value={qty} onChange={(e) => setQty(e.target.value)} />
          <TextField label="Note" hint="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          {msg && <p className="rp-sr-save" data-tone={msg.tone} role={msg.tone === "error" ? "alert" : "status"}>{msg.text}</p>}
        </Dialog>
      )}
    </SectionCard>
  );
}
