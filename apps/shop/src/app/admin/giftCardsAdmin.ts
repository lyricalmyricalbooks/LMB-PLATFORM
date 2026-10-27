// Admin › Gift cards: status, money and search helpers. Pure, tested.
// Balances live in whole cents (CAD) on `giftCards/{id}`; only the server writes them.
import { shopDate } from "../features/site/preorder";
import type { GiftCardBody } from "../../shared/giftCardActions";
import type { BadgeTone } from "./riso/components";

export type GiftCardStatus = { key: "active" | "used" | "disabled" | "expired" | "test"; label: string; tone: BadgeTone };

export function giftCardStatus(card: any, today: string = shopDate()): GiftCardStatus {
  if (card?.isTest === true) return { key: "test", label: "Test", tone: "info" };
  if (card?.enabled === false) return { key: "disabled", label: "Disabled", tone: "neutral" };
  const expires = String(card?.expiresOn || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires) && expires < today) return { key: "expired", label: "Expired", tone: "warning" };
  if (!(Number(card?.balanceMinor) > 0)) return { key: "used", label: "Used up", tone: "neutral" };
  return { key: "active", label: "Active", tone: "success" };
}

/** CA$12.50 from 1250 cents. */
export const formatMinor = (minor: any) => `CA$${((Number(minor) || 0) / 100).toFixed(2)}`;

/** "••••ABCD" */
export const maskedCode = (card: any) => `••••${String(card?.last4 || String(card?.code || "").slice(-4) || "????")}`;

/** Dollars typed by the owner ("25", "25.5", "-10") → whole cents; NaN when it isn't a number. */
export function dollarsToMinor(value: unknown): number {
  const text = String(value ?? "").trim().replace(/^CA\$|^\$/i, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
}

export function matchesGiftCard(card: any, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^•+/, "");
  if (!q) return true;
  // A whole code as typed or pasted: hyphens, spaces and case don't matter.
  const bare = (v: any) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (bare(q).length >= 8 && bare(card?.code) === bare(q)) return true;
  return [card?.last4, card?.recipientEmail, card?.recipientName, card?.purchaserEmail, card?.orderId]
    .some((v) => String(v || "").toLowerCase().includes(q));
}

/** Issue form → server payload, or a list of problems to show. */
export function issuePayload(form: { amount: string; recipientEmail: string; recipientName: string; message: string; expiresOn: string; note: string; sendEmail: boolean }, today: string = shopDate()):
  { ok: true; payload: GiftCardBody<"issue"> } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const amountMinor = dollarsToMinor(form.amount);
  // Same limits as the server (functions/index.js handleGiftCardAdmin).
  if (!(amountMinor >= 100 && amountMinor <= 1000000)) problems.push("Enter an amount between CA$1 and CA$10,000, e.g. 25.");
  const email = form.recipientEmail.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push("Check the recipient's email address.");
  if (form.sendEmail && !email) problems.push("Add the recipient's email to send them the code, or turn off emailing.");
  if (form.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiresOn) || form.expiresOn < today)) problems.push("The expiry date must be today or later.");
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    payload: {
      amountMinor,
      ...(email ? { recipientEmail: email } : {}),
      ...(form.recipientName.trim() ? { recipientName: form.recipientName.trim().slice(0, 100) } : {}),
      ...(form.message.trim() ? { message: form.message.trim().slice(0, 300) } : {}),
      ...(form.expiresOn ? { expiresOn: form.expiresOn } : {}),
      ...(form.note.trim() ? { note: form.note.trim().slice(0, 500) } : {}),
      sendEmail: !!form.sendEmail && !!email,
    },
  };
}

const HISTORY_LABEL: Record<string, string> = {
  issued: "Issued", redeemed: "Used at checkout", refunded: "Money put back (refund)", adjusted: "Balance adjusted",
  disabled: "Disabled", enabled: "Enabled again", emailed: "Code emailed", expiry: "Expiry changed",
};
export const historyLabel = (type: string) => HISTORY_LABEL[type] || type;

/** "+CA$10.00" / "−CA$5.00" for a history line; "" when no money moved. Removals keep their minus sign. */
export function historyAmount(entry: any): string {
  const minor = Number(entry?.minor) || 0;
  if (!minor) return "";
  const out = entry?.type === "redeemed" || minor < 0;
  return `${out ? "−" : "+"}${formatMinor(Math.abs(minor))}`;
}

const toTime = (v: any) => (typeof v?.toDate === "function" ? v.toDate().getTime() : Date.parse(String(v || ""))) || 0;
export const createdTime = (card: any) => toTime(card?.createdAt);
export const historyTime = (entry: any) => toTime(entry?.at);

// Spreadsheet-safe cell: a leading = + - @ (not a plain number) can't start a formula (as orderCsv.ts).
function cell(v: any) {
  const text = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Admin › Gift cards › Export CSV. Codes are masked unless `fullCodes` (the owner confirms that first). */
export function giftCardsCsv(cards: any[], { fullCodes = false, today = shopDate() }: { fullCodes?: boolean; today?: string } = {}): string {
  const header = ["Code", "Balance (CAD)", "Initial value (CAD)", "Status", "Recipient name", "Recipient email", "Source", "Order", "Created", "Expires"];
  const money = (m: any) => ((Number(m) || 0) / 100).toFixed(2);
  const created = (c: any) => { const t = createdTime(c); return t ? new Date(t).toISOString().slice(0, 10) : ""; };
  const rows = cards.map((c) => [
    fullCodes ? c.code || maskedCode(c) : maskedCode(c), money(c.balanceMinor), money(c.initialMinor), giftCardStatus(c, today).label,
    c.recipientName || "", c.recipientEmail || "", c.source === "order" ? "Bought in the shop" : "Issued by you", c.orderId || "",
    created(c), c.expiresOn || "",
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
