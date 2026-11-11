// Stockroom › QR codes: the list the page shows, as the mockup draws it (a name, a line on what the code opens, Print).
// Pure. Codes come from what the shop already has (its home page, each item's card payment link) plus the owner's
// own codes from New code, kept in `adminPrefs/qrCodes` (qrCodesStore.ts).
import type { StockBook } from "./stockroomData";

export type QrCode = { id: string; name: string; url: string; sub: string; own: boolean };
/** One code the owner made with New code, as stored. */
export type OwnCode = { id: string; name: string; url: string };

export const MAX_OWN_CODES = 100;
const MAX_NAME = 80;
const MAX_URL = 600;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** A link a phone can open from a printed code: https only (an http, javascript: or typo'd address prints nothing). */
export const linkOk = (url: string) => /^https:\/\/[^\s/]+\.[^\s]+$/.test(url) && url.length <= MAX_URL;
const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } };

/** An item's card payment link, as the stockroom keeps it (Stripe first, then a PayPal link). */
export function paymentLinkOf(book: StockBook): string {
  const stripe = text(book.stripeLink);
  if (linkOk(stripe)) return stripe;
  const other = text(book.paymentLink);
  return linkOk(other) ? other : "";
}

/** The owner's own codes from storage, cleaned: never throws, drops anything that can't print. */
export function cleanOwnCodes(raw: unknown): OwnCode[] {
  let list: unknown = raw;
  if (typeof raw === "string") { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: OwnCode[] = [];
  for (const item of list) {
    const id = text((item as OwnCode)?.id), name = text((item as OwnCode)?.name).slice(0, MAX_NAME), url = text((item as OwnCode)?.url);
    if (!id || !name || !linkOk(url) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, url });
    if (out.length >= MAX_OWN_CODES) break;
  }
  return out;
}

/** Every code, in the page's order: the shop, each item's card payment, then the owner's own. */
export function qrCodeList({ books, siteUrl, own }: { books: StockBook[]; siteUrl: string; own: OwnCode[] }): QrCode[] {
  const codes: QrCode[] = [];
  if (linkOk(siteUrl)) codes.push({ id: "shop", name: "Your shop", url: siteUrl, sub: "Opens your shop's home page", own: false });
  for (const book of books) {
    const url = paymentLinkOf(book);
    if (url && !book.isTest) codes.push({ id: `pay-${book.id}`, name: `Card payment: ${book.title}`, url, sub: "Opens a card checkout", own: false });
  }
  for (const code of own) codes.push({ ...code, sub: `Opens ${hostOf(code.url)}`, own: true });
  return codes;
}

/** Items with no payment link yet: the page says how many, since they have no code. */
export const booksWithoutLink = (books: StockBook[]) => books.filter((b) => !b.isTest && !paymentLinkOf(b)).length;

/** Why a new code can't be kept, or null. */
export function newCodeProblem(name: string, url: string, own: OwnCode[]): { name?: string; url?: string } | null {
  const problems: { name?: string; url?: string } = {};
  if (!name.trim()) problems.name = "Give the code a name.";
  else if (name.trim().length > MAX_NAME) problems.name = `Keep the name under ${MAX_NAME} characters.`;
  else if (own.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) problems.name = "You already have a code with this name.";
  if (!url.trim()) problems.url = "Paste the link the code should open.";
  else if (!linkOk(url.trim())) problems.url = "Use a full link that starts with https://";
  if (own.length >= MAX_OWN_CODES) problems.name = `You can keep up to ${MAX_OWN_CODES} codes.`;
  return problems.name || problems.url ? problems : null;
}

export const newOwnCode = (name: string, url: string, now = Date.now()): OwnCode => ({ id: `c${now.toString(36)}`, name: name.trim(), url: url.trim() });
