// Stockroom › Stock › one book › Author money: what the press and the author owe each other, the statement to send,
// and "Record as settled" / Undo (authorMoney.ts). Publisher shops only, or a shop whose records already hold some.
import { useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { Dialog, PrimaryButton, SecondaryButton, SectionCard, TextField, useConfirm } from "../riso/components";
import { useShopWords } from "../shopWords";
import { authorMoneyPlan, authorStatement, pastSettlements, recordSettlement, undoSettlement } from "./authorMoney";
import { todayText } from "./invoiceMake";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;

export function AuthorMoneyCard({ bookId, book, state, onSaved }: { bookId: string; book: Row | null; state: Row; onSaved: () => void }) {
  const w = useShopWords();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayText());
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [ask, confirmNode] = useConfirm();
  const plan = authorMoneyPlan(book, state);
  const past = pastSettlements(state);
  if (!book) return null;
  const cur = String(book.currency || "CAD");
  const money = (n: number) => fmt(n, cur);

  async function save(step: (s: Row) => Row, after?: () => void) {
    setBusy(true); setMsg(null);
    try {
      const r = await stockroomWriteApi.saveBookState(bookId, step);
      setMsg(describeResult(r));
      if (r.status === "saved" || r.status === "unchanged") { after?.(); onSaved(); }
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Nothing was saved. Try again." });
    }
    setBusy(false);
  }
  async function undo(p: Row) {
    if (!(await ask({ title: "Undo this settlement?", message: `The ${fmtD(p.date)} settlement comes off, and what it cleared is owed again.`, confirmLabel: "Undo it" }))) return;
    await save(undoSettlement(String(p.id)));
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMsg({ tone: "success", text: "Statement copied." }); }
    catch { setMsg({ tone: "error", text: "Copying was blocked. Select the statement and copy it by hand." }); }
  }

  const b = plan?.balance;
  const headline = !plan ? `Set the ${w("author")}'s share in Edit details to work this out.`
    : plan.error ? "Two settlements overlap. Undo the wrong one below."
    : b!.direction === "to-artist" ? `You owe the ${w("author")} ${money(b!.amount)}.`
    : b!.direction === "to-publisher" ? `The ${w("author")} owes you ${money(b!.amount)}.`
    : "All square.";
  const statement = plan && !plan.error ? authorStatement(book, plan, todayText()) : "";

  return (
    <SectionCard title={w("Author money")} description={headline}
      actions={plan && !plan.error ? <>
        <SecondaryButton size="sm" onClick={() => void copy(statement)}>Copy statement</SecondaryButton>
        <SecondaryButton size="sm" disabled={busy || !plan.hasWork} onClick={() => { setMsg(null); setDate(todayText()); setMethod(""); setNotes(""); setOpen(true); }}>Record as settled</SecondaryButton>
      </> : undefined}>
      {statement && <details className="rp-sr-statement"><summary>See the statement</summary><pre style={{ whiteSpace: "pre-wrap", font: "inherit" }}>{statement}</pre></details>}
      {past.length > 0 && <ul className="rp-sr-list">{past.map((p) => (
        <li key={String(p.id)}>{fmtD(p.date)}: settled{p.method ? ` by ${p.method}` : ""}, {money(Number(p.settlement?.balance?.amount) || 0)} changed hands.{" "}
          <SecondaryButton size="sm" disabled={busy} onClick={() => void undo(p)}>Undo</SecondaryButton></li>))}</ul>}
      {msg && !open && <p className="rp-sr-save" data-tone={msg.tone} role={msg.tone === "error" ? "alert" : "status"}>{msg.text}</p>}
      {open && plan && (
        <Dialog open onClose={() => setOpen(false)} title={w("Record the author settlement")}
          footer={<><SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton busy={busy} onClick={() => void save(recordSettlement(book, plan.id, { date, method: method.trim(), notes: notes.trim() }), () => setOpen(false))}>Record it</PrimaryButton></>}>
          <p>{headline} Record it once the money has changed hands.</p>
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="How it was paid" hint="Optional, like e-Transfer" value={method} onChange={(e) => setMethod(e.target.value)} />
          <TextField label="Note" hint="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {msg && <p className="rp-sr-save" data-tone={msg.tone} role={msg.tone === "error" ? "alert" : "status"}>{msg.text}</p>}
        </Dialog>
      )}
      {confirmNode}
    </SectionCard>
  );
}
