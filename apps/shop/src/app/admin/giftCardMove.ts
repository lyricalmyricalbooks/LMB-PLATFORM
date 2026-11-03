// Admin › Gift cards › Bring gift cards over (plan 23.5): reads the old shop's gift card file in the browser and
// turns each line into a card for the server's `import` action (functions/giftCardImport.js), which writes them.
// Pure and tested. Column names are matched loosely, so the files of the common shop builders all read the same.
// Most old shops only show the last few characters of a code: those cards get a new code here, and the owner can
// email each holder theirs.
import { parseCsv, parseMoney } from "./catalogImport";
import type { GiftCardBody } from "../../shared/giftCardActions";

export type ImportCard = GiftCardBody<"import">["cards"][number];

export interface GiftCardFile {
  cards: (ImportCard & { line: number; lastChars: string })[];
  skipped: { line: number; reason: string }[];
  problems: string[];
  totalMinor: number;
  keepCodes: number;
  newCodes: number;
  /** New codes whose holder has an email address to send it to. */
  canEmail: number;
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const CODE = ["code", "gift card code", "card code", "gift card number", "card number", "gan", "number"];
const LAST = ["last characters", "last 4", "last four", "last 4 characters"];
const ID = ["id", "gift card id", "card id"];
const BALANCE = ["balance", "current balance", "remaining balance", "balance remaining", "amount remaining", "remaining value", "remaining amount", "value", "amount"];
const CURRENCY = ["currency", "currency code"];
const EXPIRES = ["expires on", "expires", "expiry", "expiry date", "expiration", "expiration date", "expires at"];
const DISABLED_AT = ["disabled at", "deactivated at"];
const STATUS = ["status", "state"];
const EMAIL = ["email", "customer email", "recipient email", "email address"];
const NAME = ["customer name", "recipient name", "recipient", "name"];

/** A code the old shop wrote out in full: letters and digits only, no stars or dots hiding part of it. */
export function fullCode(value: string): string {
  const v = value.trim();
  if (!v || /[*•…]|x{3,}/i.test(v)) return "";
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length >= 8 && raw.length <= 24 ? raw : "";
}

/** "2027-12-31", "2027-12-31T23:59:59Z" or a date the browser can read → YYYY-MM-DD; "" when blank; null when unreadable. */
export function dayOf(value: string): string | null {
  const v = value.trim();
  if (!v) return "";
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (iso) return iso[1];
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function readGiftCardFile(text: string, today: string): GiftCardFile {
  const out: GiftCardFile = { cards: [], skipped: [], problems: [], totalMinor: 0, keepCodes: 0, newCodes: 0, canEmail: 0 };
  const table = parseCsv(text);
  if (!table.length) { out.problems.push("This file is empty."); return out; }
  const heads = table[0].map(key);
  const at = (names: string[]) => { for (const n of names) { const i = heads.indexOf(n); if (i >= 0) return i; } return -1; };
  const col = { code: at(CODE), last: at(LAST), id: at(ID), balance: at(BALANCE), currency: at(CURRENCY), expires: at(EXPIRES), disabledAt: at(DISABLED_AT), status: at(STATUS), email: at(EMAIL), name: at(NAME) };
  if (col.balance < 0) { out.problems.push("This file doesn't look like a gift card list: it needs a column with each card's balance."); return out; }
  if (col.code < 0 && col.last < 0 && col.id < 0) { out.problems.push("This file doesn't look like a gift card list: it needs a column with each card's code or id."); return out; }
  const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
  table.slice(1).forEach((row, n) => {
    const line = n + 2;
    const skip = (reason: string) => out.skipped.push({ line, reason });
    const money = parseMoney(cell(row, col.balance));
    const balanceMinor = Number.isNaN(money) ? NaN : Math.round(money * 100);
    if (!(balanceMinor > 0)) return skip("no balance left");
    const currency = cell(row, col.currency).toUpperCase();
    if (currency && currency !== "CAD") return skip(`in ${currency}, and gift cards here are in Canadian dollars`);
    if (cell(row, col.disabledAt) || /^(disabled|deactivated|inactive|void|voided|cancell?ed|blocked)$/i.test(cell(row, col.status))) return skip("turned off in your old shop");
    const expires = dayOf(cell(row, col.expires));
    if (expires === null) return skip("its expiry date couldn't be read");
    if (expires && expires < today) return skip("already expired");
    if (balanceMinor > 1000000) return skip("a balance over CA$10,000");
    const code = fullCode(cell(row, col.code));
    const lastChars = cell(row, col.last) || (code ? code.slice(-4) : cell(row, col.code).replace(/[^A-Za-z0-9]/g, "").slice(-4));
    const email = cell(row, col.email).toLowerCase();
    const id = cell(row, col.id);
    const oldRef = id ? `id:${id}` : code ? `code:${code}` : `line:${lastChars}|${email}|${balanceMinor}`;
    out.cards.push({
      line, lastChars, oldRef: oldRef.slice(0, 200), balanceMinor,
      ...(code ? { code } : {}), ...(expires ? { expiresOn: expires } : {}),
      ...(email ? { recipientEmail: email.slice(0, 320) } : {}), ...(cell(row, col.name) ? { recipientName: cell(row, col.name).slice(0, 100) } : {}),
    });
    out.totalMinor += balanceMinor;
    if (code) out.keepCodes++;
    else { out.newCodes++; if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) out.canEmail++; }
  });
  if (!out.cards.length && !out.skipped.length) out.problems.push("This file has no gift cards in it.");
  return out;
}

/** The cards in batches the server takes in one call. */
export const batches = <T,>(items: T[], size = 500): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
