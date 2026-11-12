// Invoices › Card pay link: a link the customer pays the invoice from by card, on the shop's own payment account. The
// server keeps the amount and makes each card page (functions/invoicePay.js); the invoice keeps the link as `stripe`
// ({ url, token, madeAt }, the old stockroom's field, so the email, the printed page and the reminder already show it).
// Nothing marks the invoice paid on the server: Invoices asks which links are paid when it opens and records them here,
// through the stockroom's own "mark paid" rule (invoice-settle.js), the way the fair till records a QR sale.
import { settleInvoicePaid } from "@stockroom/invoice-settle.js";
import { auth } from "../../../lib/firebase";
import { functionFetch } from "../../lib/functionsBase";
import type { StockroomRecords } from "./stockroomData";
import { cardLinkOf, queueCardLinkClose, staleList, type StaleCardLink } from "./cardLinkQueue";

export { cardLinkOf, queueCardLinkClose, type StaleCardLink } from "./cardLinkQueue";

type Rec = Record<string, any>;
export type CardLinkStatus = { ref: string; paid: boolean; paidAt: string | null; amountMinor: number; currency: string; open: boolean };

async function post(body: Rec): Promise<Rec> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop's owner.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "invoicePay", ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The payment service answered ${response.status}. Try again in a moment.`);
  return data;
}

/** The server calls. The admin fixture swaps them. */
export const invoiceCardPayApi = {
  make: async (link: { ref: string; kind: "invoice" | "settle"; label: string; amount: number; currency: string; email?: string }) => {
    const data = await post({ op: "make", link });
    return { token: String(data.token), url: String(data.url) };
  },
  status: async (tokens: string[]): Promise<Record<string, CardLinkStatus>> => (tokens.length ? (await post({ op: "status", tokens })).links || {} : {}),
  /** Close a link so it takes no new payment. Says when it turned out to be paid already. */
  close: async (token: string): Promise<{ paid: boolean; paidAt: string | null; amountMinor: number; currency: string }> => {
    const data = await post({ op: "close", token });
    return { paid: data.paid === true, paidAt: data.paidAt || null, amountMinor: Number(data.amountMinor) || 0, currency: String(data.currency || "") };
  },
};

// ── Links that must stop taking money ─────────────────────────────────────────────────────────────────────────────
// An invoice whose amount changed, that was deleted, or that was marked paid by hand leaves its emailed card link
// behind. The change that did it notes the link on the item's records (`cardLinksToClose`), and the next check of card
// payments closes it on the server. A card page already open can still be paid for about an hour, so a closed link is
// asked about for a day; a payment that came in on it is reported to the owner, never lost.

/** A payment that came in on a link whose invoice had changed, was deleted or was already paid another way. */
export type StrayCardPayment = { num: string; why: StaleCardLink["why"]; amountMinor: number; currency: string; paidAt: string | null };

const WATCH_CLOSED_MS = 24 * 60 * 60 * 1000;
/** Close the noted links, and report a payment that came in on one. Never throws. */
export async function closeStaleCardLinks(records: StockroomRecords, deps: {
  close?: typeof invoiceCardPayApi.close;
  save: (bookId: string, change: (s: Rec) => Rec) => Promise<{ ok: boolean; state?: Rec }>;
  onSaved?: (bookId: string, state: Rec) => void;
  now?: () => number;
}): Promise<StrayCardPayment[]> {
  const now = deps.now ? deps.now() : Date.now();
  const strays: StrayCardPayment[] = [];
  for (const book of records.books) {
    const list = staleList((records.states[book.id] || {}) as Rec);
    if (!list.length) continue;
    const done = new Map<string, "drop" | "closed">();
    for (const link of list) {
      let answer;
      try { answer = await (deps.close || invoiceCardPayApi.close)(link.token); } catch { continue; }
      if (answer.paid) {
        // An invoice marked paid by card through this very link is no stray: only a second way of paying is.
        strays.push({ num: link.num, why: link.why, amountMinor: answer.amountMinor, currency: answer.currency, paidAt: answer.paidAt });
        done.set(link.token, "drop");
      } else if (!link.closedAt) done.set(link.token, "closed");
      // Watched for a day after closing (an open card page lasts about an hour); this was the last look.
      else if (now - link.closedAt > WATCH_CLOSED_MS) done.set(link.token, "drop");
    }
    if (!done.size) continue;
    const result = await deps.save(book.id, (state: Rec) => {
      state.cardLinksToClose = staleList(state)
        .filter((l) => done.get(l.token) !== "drop")
        .map((l) => (done.get(l.token) === "closed" && !l.closedAt ? { ...l, closedAt: now } : l));
      if (!(state.cardLinksToClose as unknown[]).length) delete state.cardLinksToClose;
      return state;
    }).catch(() => ({ ok: false }));
    if (result.ok && "state" in result && result.state) deps.onSaved?.(book.id, result.state);
  }
  return strays;
}

/** The words for a payment that came in on an old link (one line each, for the owner's alert). */
export function strayPaymentLine(p: StrayCardPayment): string {
  const amount = `${(p.amountMinor / 100).toFixed(2)} ${p.currency}`.trim();
  const why = p.why === "changed" ? "after its amount was changed" : p.why === "deleted" ? "after it was deleted" : p.why === "replaced" ? "on a link that a newer one replaced" : "after it was marked paid another way";
  return `${amount} was paid by card on invoice ${p.num || "(no number)"} ${why}. Check it and refund what isn't owed.`;
}

/** Why a card link can't be made for this invoice, or null. */
export function cardLinkRefusal(inv: Rec): string | null {
  if (inv.status === "paid") return "This invoice is already paid.";
  if (inv.status === "cancelled") return "This invoice was cancelled.";
  if (!(Number(inv.total) >= 0.5)) return "A card can't take less than 0.50.";
  return null;
}

/** The change that keeps a new card link on the invoice (and makes it the invoice's payment link). */
export function attachCardLinkChange(id: string, link: { url: string; token: string }, now: number) {
  return (state: Rec) => {
    const inv = ((state.invoices as Rec[]) || []).find((i) => i && String(i.id) === id);
    if (!inv) throw new Error("This invoice is no longer in the records. Reload the page.");
    if (inv.status === "paid" || inv.status === "cancelled") throw new Error(`This invoice is ${inv.status}, so it needs no card link.`);
    // An older link for this invoice was closed by the server when this one was made: keep an eye on it for a late payment.
    if (cardLinkOf(inv)?.token !== link.token) queueCardLinkClose(state, inv, "replaced", now);
    inv.stripe = { url: link.url, token: link.token, madeAt: now, amount: Number(inv.total) || 0, currency: inv.currencyCode || inv.currency || "" };
    inv.paymentLink = link.url;
    inv.updatedAt = now;
    return state;
  };
}

/** Every unpaid invoice waiting on a card link: { token → where it is saved }. */
export function waitingCardLinks(records: StockroomRecords): Map<string, { bookId: string; invoiceId: string }> {
  const out = new Map<string, { bookId: string; invoiceId: string }>();
  for (const book of records.books) {
    for (const inv of (records.states[book.id]?.invoices as Rec[]) || []) {
      const link = cardLinkOf(inv);
      if (link && inv.status !== "paid" && inv.status !== "cancelled" && !out.has(link.token)) out.set(link.token, { bookId: book.id, invoiceId: String(inv.id) });
    }
  }
  return out;
}

/** The change that records a card payment on the invoice (the stockroom's own rule; refuses twice). */
export function cardPaidChange(id: string, paidAt: number) {
  return (state: Rec) => {
    const done = settleInvoicePaid(state, id, { method: "Card", paidAt });
    if (!done.ok) throw new Error(done.reason === "paid" ? "already paid" : done.reason);
    return state;
  };
}

const STATUS_BATCH = 50;

/**
 * Asks which card links are paid and marks those invoices paid. Returns the invoice ids it marked. Never throws: a
 * missing connection just leaves them for next time.
 */
export async function recordCardPayments(records: StockroomRecords, deps: {
  status?: typeof invoiceCardPayApi.status;
  save: (bookId: string, change: (s: Rec) => Rec) => Promise<{ ok: boolean; state?: Rec }>;
  onSaved?: (bookId: string, state: Rec) => void;
}): Promise<string[]> {
  const waiting = waitingCardLinks(records);
  if (!waiting.size) return [];
  let links: Record<string, CardLinkStatus> = {};
  // The server answers 50 links at a time: ask for every waiting one, not only the first 50.
  const tokens = [...waiting.keys()];
  for (let i = 0; i < tokens.length; i += STATUS_BATCH) {
    try { Object.assign(links, await (deps.status || invoiceCardPayApi.status)(tokens.slice(i, i + STATUS_BATCH))); } catch { break; }
  }
  const marked: string[] = [];
  for (const [token, where] of waiting) {
    const link = links[token];
    if (!link?.paid) continue;
    const paidAt = Date.parse(String(link.paidAt)) || Date.now();
    const result = await deps.save(where.bookId, cardPaidChange(where.invoiceId, paidAt)).catch(() => ({ ok: false }));
    if (result.ok) {
      marked.push(where.invoiceId);
      if ("state" in result && result.state) deps.onSaved?.(where.bookId, result.state);
    }
  }
  return marked;
}
