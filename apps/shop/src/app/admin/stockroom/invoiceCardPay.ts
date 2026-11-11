// Invoices › Card pay link: a link the customer pays the invoice from by card, on the shop's own payment account. The
// server keeps the amount and makes each card page (functions/invoicePay.js); the invoice keeps the link as `stripe`
// ({ url, token, madeAt }, the old stockroom's field, so the email, the printed page and the reminder already show it).
// Nothing marks the invoice paid on the server: Invoices asks which links are paid when it opens and records them here,
// through the stockroom's own "mark paid" rule (invoice-settle.js), the way the fair till records a QR sale.
import { settleInvoicePaid } from "@stockroom/invoice-settle.js";
import { auth } from "../../../lib/firebase";
import { functionFetch } from "../../lib/functionsBase";
import type { StockroomRecords } from "./stockroomData";

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
};

/** The invoice's card link, if it has one this admin made (an old stockroom Stripe link has no token). */
export const cardLinkOf = (inv: Rec | null | undefined): { url: string; token: string } | null =>
  inv?.stripe && typeof inv.stripe.token === "string" && /^[a-f0-9]{32}$/.test(inv.stripe.token) && typeof inv.stripe.url === "string"
    ? { url: inv.stripe.url, token: inv.stripe.token } : null;

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
  try { links = await (deps.status || invoiceCardPayApi.status)([...waiting.keys()].slice(0, 50)); } catch { return []; }
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
