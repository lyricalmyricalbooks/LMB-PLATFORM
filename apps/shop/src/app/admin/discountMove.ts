// Discounts › Bring codes over (plan 23.30): reads the old shop's discount code file in the browser and turns each code
// a customer may still hold into a discount here, so a code promised before the move still works at checkout. Pure and
// tested. Column names are matched loosely, so the files of the common shop builders all read the same. Only simple
// codes come over (a percentage, an amount off, or free shipping, on the whole order); anything narrower is listed for
// the owner to set up by hand, since the old shop's product and collection names don't exist here.
import { parseCsv, parseMoney } from "./catalogImport";
import { dayOf } from "./giftCardMove";
import { MONEY_SIGN } from "./moneySign";

export interface MovedDiscount {
  line: number;
  code: string;
  type: "percentage" | "fixed" | "freeship";
  value: number;
  minOrderAmount: number | null;
  minQuantity: number | null;
  /** Uses left: the old shop's limit less the times it was used. */
  usageLimit: number | null;
  onePerCustomer: boolean;
  startDate: string | null;
  expiryDate: string | null;
}

export interface DiscountFile {
  codes: MovedDiscount[];
  skipped: { line: number; reason: string }[];
  problems: string[];
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

const CODE = ["code", "discount code", "coupon code", "promo code", "promotion code", "coupon", "name", "title"];
const TYPE = ["value type", "discount type", "amount type", "type", "kind"];
const VALUE = ["value", "amount", "coupon amount", "discount amount", "discount value", "percent off", "percentage", "% off"];
const MINIMUM = ["minimum purchase requirements", "minimum spend", "minimum order amount", "minimum order", "minimum amount", "minimum purchase", "min spend", "minimum subtotal"];
const USED = ["times used", "usage count", "uses", "used", "redemptions", "times redeemed"];
const LIMIT = ["usage limit", "usage limit per code", "total usage limit", "usage limit per coupon", "max uses", "maximum uses", "limit"];
const PER_CUSTOMER = ["once per customer", "one per customer", "usage limit per user", "usage limit per customer", "limit per customer", "limit to one use per customer"];
const STARTS = ["starts", "starts at", "start date", "start", "valid from", "date start"];
const ENDS = ["ends", "ends at", "end date", "expiry date", "expires", "expires at", "expiration date", "date expires", "valid until", "end"];
const STATUS = ["status", "state", "active", "enabled"];
const NARROW = ["applies to", "entitled products", "products", "product ids", "applies to products", "collections", "categories", "product categories", "exclude products"];
const BUY_GET = ["customer buys", "customer gets", "buy quantity", "get quantity"];

const yes = (v: string) => /^(y|yes|true|1|on)$/i.test(v.trim());
const off = (v: string) => /^(n|no|false|0|off|disabled|inactive|expired|paused|draft|archived|deleted)$/i.test(v.trim());
const whole = (v: string): number | null => { const s = v.replace(/[\s,]/g, ""); return /^\d+$/.test(s) ? Number(s) : null; };
const wholeOrder = (v: string) => !v.trim() || /^(all|all products|entire order|whole order|order|everything|cart|entire cart|any|none)$/i.test(v.trim());

/** The codes in an old shop's discount file. `existing`: codes already here (matched without regard to case). */
export function readDiscountFile(text: string, today: string, existing: string[] = []): DiscountFile {
  const out: DiscountFile = { codes: [], skipped: [], problems: [] };
  const table = parseCsv(text);
  if (!table.length) { out.problems.push("This file is empty."); return out; }
  const heads = table[0].map(key);
  const at = (names: string[]) => { for (const n of names) { const i = heads.indexOf(n); if (i >= 0) return i; } return -1; };
  const col = {
    code: at(CODE), types: TYPE.map((n) => heads.indexOf(n)).filter((i) => i >= 0), value: at(VALUE), min: at(MINIMUM), used: at(USED), limit: at(LIMIT), perCustomer: at(PER_CUSTOMER),
    starts: at(STARTS), ends: at(ENDS), status: at(STATUS), narrow: NARROW.map((n) => heads.indexOf(n)).filter((i) => i >= 0),
    buyGet: BUY_GET.map((n) => heads.indexOf(n)).filter((i) => i >= 0),
  };
  if (col.code < 0 || (col.value < 0 && !col.types.length)) {
    out.problems.push("This file doesn't look like a list of discount codes: it needs each code and how much it takes off.");
    return out;
  }
  const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
  const taken = new Set(existing.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean));
  table.slice(1).forEach((row, n) => {
    if (!row.some((c) => String(c ?? "").trim())) return;
    // Some files split it in two ("Value Type" percentage, "Type" Free shipping): read them together.
    const typeText = col.types.map((i) => cell(row, i)).join(" ").toLowerCase();
    const line = n + 2;
    const skip = (reason: string) => out.skipped.push({ line, reason });
    const code = cell(row, col.code).toUpperCase();
    if (!code) return skip("no code");
    const named = (reason: string) => skip(`${code}: ${reason}`);
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return named("codes here use 3 to 32 letters, numbers, hyphens or underscores; add it by hand with a new code");
    if (taken.has(code)) return named("already here");
    const status = cell(row, col.status);
    if (status && off(status)) return named("turned off or ended in your old shop");
    const starts = dayOf(cell(row, col.starts));
    const ends = dayOf(cell(row, col.ends));
    if (starts === null || ends === null) return named("its dates couldn't be read");
    if (ends && ends < today) return named("already ended");
    const used = whole(cell(row, col.used)) ?? 0;
    const limit = whole(cell(row, col.limit));
    if (limit != null && limit > 0 && used >= limit) return named("used up");
    if (col.buyGet.some((i) => cell(row, i)) || /\bbuy\b|bogo|bxgy|\bget\b/i.test(typeText)) return named("a buy-some-get-some offer; set it up by hand in Discounts");
    if (col.narrow.some((i) => !wholeOrder(cell(row, i)))) return named("only for some items; set it up by hand in Discounts, choosing those items");
    const valueText = cell(row, col.value);
    let type: MovedDiscount["type"];
    if (/free.?ship|shipping/.test(typeText)) type = "freeship";
    else if (/percent|%/.test(typeText) || /%/.test(valueText)) type = "percentage";
    else if (/fixed|amount|flat|money|cart|order|dollar|currency/.test(typeText) || !typeText) type = "fixed";
    else return named("a kind of discount that can't come over; set it up by hand in Discounts");
    const raw = parseMoney(valueText.replace(/%/g, "").trim().replace(/^-\s*/, ""));
    const value = Number.isNaN(raw) ? NaN : Math.round(Math.abs(raw) * 100) / 100;
    if (type === "percentage" && !(value > 0 && value <= 100)) return named("its percentage couldn't be read");
    if (type === "fixed" && !(value > 0)) return named("its amount couldn't be read");
    // "Minimum purchase of $50.00" is an amount; "Minimum quantity of 2 items" is a number of items.
    const minText = cell(row, col.min);
    const byItems = /quantit|items?\b/i.test(minText);
    const minRaw = parseMoney(minText.replace(/^[^0-9.,-]+/, "").replace(/\s*items?\b.*$/i, ""));
    const minimum = byItems || Number.isNaN(minRaw) || minRaw <= 0 ? null : Math.round(minRaw * 100) / 100;
    const minItems = byItems ? whole(minText.replace(/[^0-9]/g, "")) : null;
    taken.add(code);
    out.codes.push({
      line, code, type, value: type === "freeship" ? 0 : value, minOrderAmount: minimum, minQuantity: minItems || null,
      usageLimit: limit != null && limit > 0 ? limit - used : null,
      onePerCustomer: yes(cell(row, col.perCustomer)) || (whole(cell(row, col.perCustomer)) ?? 0) === 1,
      startDate: starts || null, expiryDate: ends || null,
    });
  });
  if (!out.codes.length && !out.skipped.length) out.problems.push("This file has no discount codes in it.");
  return out;
}

/** "10% off", "CA$5.00 off" or "Free shipping", for the preview. */
export const describeMoved = (d: MovedDiscount) =>
  d.type === "freeship" ? "Free shipping" : d.type === "percentage" ? `${d.value}% off` : `${MONEY_SIGN}${d.value.toFixed(2)} off`;
