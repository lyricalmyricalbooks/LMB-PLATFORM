// "Ask for a bulk quote" on book pages (Studio › Style › Book page · photos & layout › showPdpBulkQuote).
// Pure rules: what the small form needs before it may send, and the subject and message the shop sees in Messages.
// Limits match firestore.rules' contactMessages create rule, so a valid form is never refused for size.
import { isValidAlertEmail } from "../../BackInStockForm";

export type QuoteDraft = { name: string; email: string; quantity: string; note: string };

export const MAX_QUOTE_QUANTITY = 100000;

/** The whole number asked for, or 0 when it isn't a sensible one. */
export function quoteQuantity(raw: string): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUOTE_QUANTITY ? n : 0;
}

/** The first thing missing, or null when the request may be sent. */
export function quoteProblem(draft: QuoteDraft): "name" | "email" | "quantity" | "note" | null {
  if (!draft.name.trim() || draft.name.trim().length > 120) return "name";
  if (!isValidAlertEmail(draft.email)) return "email";
  if (!quoteQuantity(draft.quantity)) return "quantity";
  if (draft.note.length > 3000) return "note";
  return null;
}

/** "Bulk quote: <title> (<edition>)", cut to the rule's 200 characters. */
export function quoteSubject(template: string, title: string, edition?: string): string {
  const name = [String(title || "").trim(), edition ? `(${String(edition).trim()})` : ""].filter(Boolean).join(" ");
  return String(template || "").replace(/\{title\}/g, name).trim().slice(0, 200);
}

/** The message the owner reads: how many first, then the buyer's note. */
export function quoteMessage(draft: QuoteDraft, title: string): string {
  const lines = [`Quantity: ${quoteQuantity(draft.quantity)}`, `Book: ${String(title || "").trim()}`];
  if (draft.note.trim()) lines.push("", draft.note.trim());
  return lines.join("\n").slice(0, 5000);
}
