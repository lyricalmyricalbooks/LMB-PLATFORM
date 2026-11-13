// Bookkeeping › Receipts › Receipts by email (beta, 12 November 2026). The shop gets its own receipts address; any
// receipt forwarded to it is read and waits here until the owner checks it and adds it as an expense (the Log expense
// page does the saving), or says it isn't a receipt. Off until the owner turns it on; "Opening soon" until the
// platform has opened it. Words and steps stay plain: nobody sets up a mailbox, a key or a rule.
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@stockroom/money.js";

import { shopDayLabel } from "../discountDescribe";
import { ActionMenu, Dialog, GhostButton, PrimaryButton, SecondaryButton, useConfirm } from "../riso/components";
import { checkedAgo, EMPTY_INBOX, receiptInboxApi, receiptTitle, senderName, type InboxView, type ReceiptInboxApi, type WaitingReceipt } from "./receiptInboxApi";

type Note = { tone: "ok" | "warn" | "error" | "busy"; text: string };
const plain = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The amount the reader found, as money, or nothing. */
function amountOf(r: WaitingReceipt, base: string): string {
  const total = Number(r.facts?.total);
  return total > 0 ? fmt(total, /^[A-Z]{3}$/.test(String(r.facts?.currency || "")) ? String(r.facts!.currency) : base) : "";
}

function HowItWorks({ open, onClose, address, onCopy }: { open: boolean; onClose: () => void; address: string; onCopy: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="How receipts by email works" footer={<PrimaryButton data-autofocus onClick={onClose}>Got it</PrimaryButton>}>
      <ol className="rp-er-steps">
        <li><strong>Copy your receipts address.</strong><span className="rp-er-address" data-small=""><code>{address}</code><GhostButton size="sm" onClick={onCopy}>Copy</GhostButton></span></li>
        <li><strong>Forward a receipt to it.</strong><span>Any emailed receipt or invoice. An attached PDF or photo is kept as the receipt.</span></li>
        <li><strong>Check it and add it.</strong><span>It shows up here within 15 minutes, already read. Nothing is added until you say so.</span></li>
      </ol>
      <details className="rp-er-more">
        <summary>Forward automatically from Gmail</summary>
        <ol>
          <li>In Gmail, open Settings › Forwarding and add your receipts address.</li>
          <li>Gmail sends a code. It appears on this page within a few minutes: type it into Gmail.</li>
          <li>Make a Gmail filter for the senders whose receipts you want, and choose “Forward it to” your receipts address.</li>
        </ol>
      </details>
    </Dialog>
  );
}

export function EmailReceipts({ baseCurrency, onReview, api = receiptInboxApi, refreshKey = 0 }: {
  baseCurrency: string;
  /** Opens Log expense with this receipt filled in. Without it the list is read-only. */ onReview?: (receipt: WaitingReceipt) => void;
  api?: ReceiptInboxApi; /** Changes after a receipt was added, so the list is read again. */ refreshKey?: number;
}) {
  const [view, setView] = useState<InboxView | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState("");
  const [help, setHelp] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async (what: string, call: () => Promise<InboxView>, done?: string) => {
    setBusy(what); setNote(null);
    try {
      const next = await call();
      if (!alive.current) return null;
      setView(next);
      if (done) setNote({ tone: "ok", text: done });
      return next;
    } catch (error) {
      if (alive.current) setNote({ tone: "error", text: plain(error, "That didn't work just now. Try again in a minute.") });
      return null;
    } finally { if (alive.current) setBusy(""); }
  }, []);

  // The first look: what the server already holds, then (when on) a fresh collection so a just-forwarded receipt shows.
  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const first = await api.status();
        if (stop) return;
        setView(first);
        if (first.on) { const fresh = await api.check().catch(() => null); if (fresh && !stop) setView(fresh); }
      } catch { if (!stop) setView(EMPTY_INBOX); }
    })();
    return () => { stop = true; };
  }, [api, refreshKey]);

  const copy = async (text: string, said: string) => {
    try { await navigator.clipboard.writeText(text); setNote({ tone: "ok", text: said }); }
    catch { setNote({ tone: "warn", text: "Couldn't copy. Select it and copy it yourself." }); }
  };
  const notReceipt = async (r: WaitingReceipt) => {
    setBusy(`done:${r.id}`); setNote(null);
    try {
      await api.done(r.id);
      if (alive.current) { setView((v) => (v ? { ...v, waiting: v.waiting.filter((w) => w.id !== r.id) } : v)); setNote({ tone: "ok", text: "Removed. Nothing was added." }); }
    } catch (error) { if (alive.current) setNote({ tone: "error", text: plain(error, "That didn't work just now. Try again in a minute.") }); }
    finally { if (alive.current) setBusy(""); }
  };

  if (!view) return <section className="rp-er" aria-busy="true"><p className="rp-er-line">Opening receipts by email…</p></section>;
  const head = (
    <div className="rp-er-head">
      <h3 className="rp-er-title">Receipts by email <span className="rp-er-beta">Beta</span></h3>
      {view.on && (
        <div className="rp-er-tools">
          <span className="rp-er-checked">{checkedAgo(view.checkedAt)}</span>
          <SecondaryButton size="sm" busy={busy === "check"} onClick={() => void run("check", api.check)}>Check now</SecondaryButton>
          <ActionMenu label="More for receipts by email" actions={[
            { label: "How it works", onSelect: () => setHelp(true) },
            { label: "Get a new address", onSelect: async () => {
              if (await ask({ title: "Get a new receipts address?", message: "The old address stops working. Anything you set to forward to it needs the new one.", confirmLabel: "Get a new address" })) void run("new", api.newAddress, "Your new address is ready. The old one no longer works.");
            } },
            { label: "Turn off", tone: "danger", onSelect: async () => {
              if (await ask({ title: "Turn off receipts by email?", message: "Receipts forwarded while it is off are not read. Your address is kept for when you turn it back on.", confirmLabel: "Turn off" })) void run("stop", api.stop, "Turned off. Your address is kept.");
            } },
          ]} />
        </div>
      )}
    </div>
  );
  const noteLine = note && <p className="rp-sr-save" data-tone={note.tone} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>;

  if (!view.available) {
    return <section className="rp-er" data-state="soon">{head}<p className="rp-er-line">Forward a receipt and it is read for you. <strong>Opening soon.</strong></p></section>;
  }
  if (!view.on) {
    return (
      <section className="rp-er" data-state="off">
        {head}
        <p className="rp-er-line">Forward any emailed receipt to your shop’s own address. It is read for you, and you check it before it is added.</p>
        <div className="rp-er-row">
          <PrimaryButton busy={busy === "start"} onClick={async () => { if (await run("start", api.start)) setHelp(true); }}>
            {view.address ? "Turn on" : "Get my receipts address"}
          </PrimaryButton>
        </div>
        {noteLine}
      </section>
    );
  }
  return (
    <section className="rp-er" data-state="on">
      {head}
      <div className="rp-er-row">
        <span className="rp-er-address"><code>{view.address}</code><GhostButton size="sm" onClick={() => void copy(view.address, "Address copied. Forward a receipt to it.")}>Copy</GhostButton></span>
        <button type="button" className="rp-er-link" onClick={() => setHelp(true)}>How it works</button>
      </div>
      {view.gmailCode && (
        <div className="rp-er-code" role="status">
          <span>Gmail’s confirmation code{view.gmailCode.from ? ` for ${view.gmailCode.from}` : ""}: <strong>{view.gmailCode.code}</strong>. Type it into Gmail to finish.</span>
          <span className="rp-rc-actions">
            <GhostButton size="sm" onClick={() => void copy(view.gmailCode!.code, "Code copied.")}>Copy code</GhostButton>
            <GhostButton size="sm" busy={busy === "code"} onClick={() => void run("code", api.codeSeen)}>Done</GhostButton>
          </span>
        </div>
      )}
      {noteLine}
      {view.waiting.length ? (
        <>
          <p className="rp-er-count">{view.waiting.length} waiting for you</p>
          <ul className="rp-er-list">
            {view.waiting.map((r) => {
              const amount = amountOf(r, baseCurrency);
              const day = /^\d{4}-\d{2}-\d{2}$/.test(String(r.facts?.date || "")) ? String(r.facts!.date) : r.receivedAt.slice(0, 10);
              return (
                <li key={r.id} className="rp-er-item" data-unsure={r.looksLike ? undefined : ""}>
                  <div className="rp-rc-head">
                    <strong>{receiptTitle(r)}</strong>
                    {amount && <span className="rp-rc-amount">{amount}</span>}
                  </div>
                  <span className="rp-rc-meta">{[shopDayLabel(day) || day, `from ${senderName(r.from)}`, r.hasFile ? "file attached" : ""].filter(Boolean).join(" · ")}</span>
                  {!r.looksLike && <span className="rp-rc-tag" data-tone="apricot">Might not be a receipt</span>}
                  {!r.facts && r.looksLike && <span className="rp-rc-tag">Couldn’t be read. Type it in.</span>}
                  <span className="rp-rc-actions">
                    {onReview && <SecondaryButton size="sm" disabled={!!busy} aria-label={`Check and add ${receiptTitle(r)}`} onClick={() => onReview(r)}>Check and add</SecondaryButton>}
                    <GhostButton size="sm" busy={busy === `done:${r.id}`} disabled={!!busy} aria-label={`${receiptTitle(r)} is not a receipt`} onClick={() => void notReceipt(r)}>Not a receipt</GhostButton>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : <p className="rp-er-line">Nothing waiting. Forwarded receipts show up here within 15 minutes.</p>}
      <HowItWorks open={help} onClose={() => setHelp(false)} address={view.address} onCopy={() => void copy(view.address, "Address copied. Forward a receipt to it.")} />
      {confirmNode}
    </section>
  );
}
