// Bookkeeping › Transactions › Bank feed (beta, 13 November 2026). A paid add-on. The owner connects the shop's bank in
// the bank's own window; each bank line then waits under To review with what it most likely is (bankMatch.ts): a card
// payout, an expense already in the books, or a new expense under the sorting rules' category. One tap confirms it.
// Read-only at the bank: nothing here can move money. A bookkeeper (no `onTaxCenter`) sees the list and changes nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { ActionMenu, GhostButton, PrimaryButton, SecondaryButton, useConfirm } from "../riso/components";
import { addOnPriceWords, bankFeedApi, EMPTY_BANK_VIEW, nextBankWords, type BankFeedApi, type BankLine, type BankMatch, type BankView } from "./bankFeedApi";
import { PlaidLogo } from "./PlaidLogo";
import { lineWords, suggestMatches, sureMatches, type SuggestedLine } from "./bankMatch";
import { checkedAgo } from "./receiptInboxApi";
import { reconcileModel } from "./reconcileModel";
import { saveTaxCenter } from "./saveTaxCenter";
import { addBusinessExpense, baseCurrencyOf, EXPENSE_CATEGORIES, type ExpenseForm } from "./taxExpense";
import { taxRatesApi } from "./taxRates";

type Row = Record<string, any>;
type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
const plain = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const TRY_AGAIN = "That didn't work just now. Try again in a minute.";
const PAGE = 25;

const amountWords = (line: BankLine) => `${line.cents > 0 ? "+" : "−"}${fmt(Math.abs(line.cents) / 100, line.currency)}`;

/** What the line most likely is, in a few words. */
function suggestionWords({ suggestion }: SuggestedLine): string {
  switch (suggestion.kind) {
    case "payout": return `Card payout${suggestion.date ? ` of ${fmtD(suggestion.date)}` : ""} · ${suggestion.sales} ${suggestion.sales === 1 ? "sale" : "sales"}`;
    case "expense": return `${suggestion.desc}${suggestion.date ? `, logged ${fmtD(suggestion.date)}` : ""}${suggestion.hasReceipt ? " · receipt attached" : ""}`;
    case "new": return "Not in your records yet";
    default: return "";
  }
}

export function BankFeed({ orders, taxCenter, onTaxCenter, api = bankFeedApi, save = saveTaxCenter }: {
  orders: Row[]; taxCenter: Row | null;
  /** Given to the owner and staff who may change the books; without it the list is read-only (the bookkeeper). */
  onTaxCenter?: (taxCenter: Row) => void; api?: BankFeedApi; save?: typeof saveTaxCenter;
}) {
  const canChange = !!onTaxCenter;
  const [view, setView] = useState<BankView | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [ask, confirmNode] = useConfirm();
  // One expense id per bank line, so a second tap or a retry never adds the same expense twice.
  const expenseIds = useRef(new Map<string, number>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async (what: string, call: () => Promise<BankView | null>, done?: string) => {
    setBusy(what); setNote(null);
    try {
      const next = await call();
      if (!alive.current) return null;
      if (next) { setView(next); if (done) setNote({ tone: "ok", text: done }); }
      return next;
    } catch (error) {
      if (alive.current) setNote({ tone: "error", text: plain(error, TRY_AGAIN) });
      return null;
    } finally { if (alive.current) setBusy(""); }
  }, []);

  // The first look: what the server already holds, then (with a bank connected) a fresh collection.
  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const first = await api.status();
        if (stop) return;
        setView(first);
        if (first.addOn.on && first.banks.length) { const fresh = await api.check().catch(() => null); if (fresh && !stop) setView(fresh); }
      } catch { if (!stop) setView(EMPTY_BANK_VIEW); }
    })();
    return () => { stop = true; };
  }, [api]);

  const payouts = useMemo(() => reconcileModel(orders), [orders]);
  const rows = useMemo(() => (view ? suggestMatches({ lines: view.waiting, payouts: payouts.payouts, taxCenter, matches: view.matches, currency: payouts.currency }) : []), [view, payouts, taxCenter]);
  const sure = useMemo(() => sureMatches(rows), [rows]);

  const decide = (what: string, matches: BankMatch[], done: string) => run(what, () => api.decide(matches), done);
  const addExpense = async ({ line, suggestion }: SuggestedLine) => {
    const cat = cats[line.id] ?? (suggestion.kind === "new" ? suggestion.cat : "");
    if (!EXPENSE_CATEGORIES.includes(cat)) { setNote({ tone: "warn", text: "Pick a category first." }); return; }
    const id = expenseIds.current.get(line.id) ?? Date.now() + Math.floor(Math.random() * 1000);
    expenseIds.current.set(line.id, id);
    const form: ExpenseForm = { desc: lineWords(line.name), cat, date: line.date, amount: (Math.abs(line.cents) / 100).toFixed(2), currency: line.currency, trip: "", ref: "" };
    setBusy(`line:${line.id}`); setNote({ tone: "busy", text: "Saving…" });
    try {
      const base = baseCurrencyOf(taxCenter);
      const rates = form.currency === base ? undefined : await taxRatesApi.expenseRatesFor([{ currency: form.currency, date: form.date }], taxCenter);
      const saved = await save((current) => addBusinessExpense(current, form, Math.abs(line.cents) / 100, id, new Date(), undefined, rates), `Added to ${cat}.`);
      if (!alive.current) return;
      if (!saved.ok) { setNote(saved.note); return; }
      if (saved.taxCenter) onTaxCenter?.(saved.taxCenter);
      setView(await api.decide([{ lineId: line.id, kind: "added", ref: String(id) }]));
      setNote(saved.note);
    } catch (error) {
      if (alive.current) setNote({ tone: "error", text: plain(error, TRY_AGAIN) });
    } finally { if (alive.current) setBusy(""); }
  };

  if (!view) return <section className="rp-er rp-bf" aria-busy="true"><p className="rp-er-line">Opening your bank feed…</p></section>;
  const title = <h3 className="rp-er-title">Bank feed <span className="rp-er-beta">Beta</span> <span className="rp-bf-by">with <PlaidLogo /></span></h3>;
  const noteLine = note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>;
  const connect = (bankId?: string) => run("connect", () => api.connect(bankId), bankId ? "Signed in again. Your bank is back." : "Bank connected. Its transactions are on their way.");

  if (!view.available) {
    return <section className="rp-er rp-bf" data-state="soon"><div className="rp-er-head">{title}</div><p className="rp-er-line">See your bank’s transactions next to your records, matched for you. Connected through Plaid. <strong>Opening soon.</strong></p></section>;
  }
  if (!view.addOn.on) {
    return (
      <section className="rp-er rp-bf" data-state="off">
        <div className="rp-er-head">{title}</div>
        <p className="rp-er-line">Your bank’s transactions arrive here every day through Plaid, already matched to your payouts and expenses. You confirm each with one tap.</p>
        <div className="rp-er-row">
          {canChange && <a className="rp-btn rp-btn-primary" href="#settings/plan">Add bank feed</a>}
          <span className="rp-bf-price">{addOnPriceWords(view.addOn)}</span>
        </div>
        {!canChange && <p className="rp-er-line">The shop’s owner can add it under Settings › Plan.</p>}
      </section>
    );
  }
  if (!view.banks.length) {
    return (
      <section className="rp-er rp-bf" data-state="connect">
        <div className="rp-er-head">{title}</div>
        <p className="rp-er-line">You sign in at your bank in Plaid’s secure window. Plaid lets us read transactions and nothing else: no money can move.</p>
        {canChange
          ? <div className="rp-er-row"><PrimaryButton busy={busy === "connect"} onClick={() => void connect()}>Connect your bank with Plaid</PrimaryButton></div>
          : <p className="rp-er-line">The shop’s owner connects the bank.</p>}
        {noteLine}
      </section>
    );
  }

  const disconnect = async (bankId: string, name: string) => {
    if (await ask({ title: `Disconnect ${name}?`, message: "New transactions stop arriving. What you already matched stays in your records.", confirmLabel: "Disconnect" })) void run("disconnect", () => api.disconnect(bankId), `${name} is disconnected.`);
  };
  const extra = nextBankWords(view);
  return (
    <section className="rp-er rp-bf" data-state="on">
      <div className="rp-er-head">
        {title}
        <div className="rp-er-tools">
          <span className="rp-er-checked">{checkedAgo(view.checkedAt)}</span>
          <SecondaryButton size="sm" busy={busy === "check"} onClick={() => void run("check", api.check)}>Check now</SecondaryButton>
        </div>
      </div>
      <ul className="rp-bf-banks">
        {view.banks.map((bank) => (
          <li key={bank.id} className="rp-bf-bank" data-trouble={bank.needsSignIn ? "" : undefined}>
            <span className="rp-bf-bank-name"><strong>{bank.name}</strong><span>{bank.needsSignIn ? "Your bank wants you to sign in again" : bank.accounts.join(" · ")}</span></span>
            {canChange && bank.needsSignIn && <SecondaryButton size="sm" busy={busy === "connect"} onClick={() => void connect(bank.id)}>Sign in again</SecondaryButton>}
            {canChange && <ActionMenu label={`More for ${bank.name}`} actions={[{ label: "Disconnect", tone: "danger", onSelect: () => void disconnect(bank.id, bank.name) }]} />}
          </li>
        ))}
        {canChange && (
          <li className="rp-bf-add">
            <GhostButton size="sm" busy={busy === "connect"} onClick={async () => {
              if (!extra || await ask({ title: "Connect another bank?", message: extra, confirmLabel: "Connect a bank" })) void connect();
            }}>+ Connect another bank</GhostButton>
          </li>
        )}
      </ul>
      {noteLine}
      {rows.length ? (
        <>
          <div className="rp-bf-review">
            <p className="rp-er-count">{rows.length} to review</p>
            {canChange && sure.length > 1 && <SecondaryButton size="sm" busy={busy === "all"} disabled={!!busy} onClick={() => void decide("all", sure, `${sure.length} matched.`)}>Confirm all {sure.length} matches</SecondaryButton>}
          </div>
          <ul className="rp-bf-list">
            {rows.slice(0, shown).map((row) => {
              const { line, suggestion } = row;
              const working = busy === `line:${line.id}`;
              const cat = cats[line.id] ?? (suggestion.kind === "new" ? suggestion.cat : "");
              const skip = { label: line.cents > 0 ? "Not a card payout" : "Not a business cost", onSelect: () => void decide(`line:${line.id}`, [{ lineId: line.id, kind: "skipped", ref: "" }], "Skipped. Nothing was added.") };
              return (
                <li key={line.id} className="rp-bf-line" data-kind={line.pending ? "pending" : suggestion.kind}>
                  <span className="rp-bf-when">{fmtD(line.date)}</span>
                  <span className="rp-bf-what"><strong>{line.name}</strong><span>{line.account}</span></span>
                  <span className="rp-bf-amount" data-in={line.cents > 0 ? "" : undefined}>{amountWords(line)}</span>
                  <span className="rp-bf-match">
                    {line.pending ? <span className="rp-rc-tag">Still going through at your bank</span>
                      : suggestion.kind === "none" ? <span className="rp-rc-tag">No payout matches</span>
                      : <><span className="rp-rc-tag" data-tone={suggestion.kind === "new" ? "apricot" : "mint"}>{suggestion.kind === "new" ? "New expense" : "Matches"}</span><span className="rp-bf-hint">{suggestionWords(row)}</span></>}
                  </span>
                  {canChange && !line.pending && (
                    <span className="rp-bf-actions">
                      {suggestion.kind === "new" && (
                        <select className="rp-select rp-bf-cat" aria-label={`Category for ${line.name}`} value={cat} disabled={!!busy}
                          onChange={(e) => setCats((c) => ({ ...c, [line.id]: e.target.value }))}>
                          <option value="">Pick a category</option>
                          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      {suggestion.kind === "payout" && <PrimaryButton size="sm" busy={working} disabled={!!busy} aria-label={`Confirm ${line.name} is the card payout`} onClick={() => void decide(`line:${line.id}`, [{ lineId: line.id, kind: "payout", ref: suggestion.payoutId }], "Matched to the payout.")}>Confirm</PrimaryButton>}
                      {suggestion.kind === "expense" && <PrimaryButton size="sm" busy={working} disabled={!!busy} aria-label={`Confirm ${line.name} is ${suggestion.desc}`} onClick={() => void decide(`line:${line.id}`, [{ lineId: line.id, kind: "expense", ref: suggestion.expenseId }], "Matched to the expense.")}>Confirm</PrimaryButton>}
                      {suggestion.kind === "new" && <PrimaryButton size="sm" busy={working} disabled={!!busy || !cat} aria-label={`Add ${line.name} as an expense`} onClick={() => void addExpense(row)}>Add expense</PrimaryButton>}
                      {suggestion.kind === "none"
                        ? <SecondaryButton size="sm" busy={working} disabled={!!busy} aria-label={`Skip ${line.name}`} onClick={skip.onSelect}>Skip</SecondaryButton>
                        : <ActionMenu label={`More for ${line.name}`} actions={[skip]} />}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > shown && <div><GhostButton size="sm" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</GhostButton></div>}
        </>
      ) : <p className="rp-er-line">All caught up. New transactions arrive every day.</p>}
      {confirmNode}
    </section>
  );
}
