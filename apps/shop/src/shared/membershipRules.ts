// Memberships & subscriptions (beta; LMB-PLATFORM tasks/todo/2026-11-18-memberships-m1.md): what a plan may be and what
// a member's state means. One source for the admin, the shop's Membership page and account, and the server
// (functions/shared/membershipRules.js is a generated copy; functions/memberships.js keeps the records).
//
// A plan is paid every month or every year on the shop's own card account, with an optional free trial. A member's
// state comes from the card provider's subscription (memberState), never from the browser.

export const MAX_PLANS = 8;
export const MAX_PLAN_NAME = 60;
export const MAX_PLAN_DESCRIPTION = 400;
export const MAX_PERKS = 8;
export const MAX_PERK = 100;
/** The lowest price: below this the card fee eats most of it. */
export const MIN_PLAN_MINOR = 200;
/** The highest price one payment takes. */
export const MAX_PLAN_MINOR = 500_000;
export const MAX_TRIAL_DAYS = 60;
/** The most a plan can take off the shop's prices for its members (M2a). */
export const MAX_MEMBER_PERCENT = 50;
/** Products in one plan's box (M3), and how many of each. */
export const MAX_BOX_ITEMS = 10;
export const MAX_BOX_QUANTITY = 10;
/** The latest cut-off day: every month has it. */
export const MAX_CUTOFF_DAY = 28;
/** Where a box can be sent (the provider's own address step asks for these). */
export const BOX_COUNTRIES: readonly string[] = Object.freeze(["CA", "US"]);

/** One product in a plan's box: a product, optionally one of its editions, and how many. */
export type BoxItem = { bookId: string; variantId?: string; quantity: number };
/** A plan that ships a box (Memberships M3): what is in it and the day of the month its orders are made. */
export type PlanBox = { items: BoxItem[]; cutoffDay: number };

export type PlanInterval = "month" | "year";
export const PLAN_INTERVALS: readonly PlanInterval[] = Object.freeze(["month", "year"]);

export type MembershipPlan = {
  name: string;
  description: string;
  /** What members get, one line each, shown as a list. */
  perks: string[];
  interval: PlanInterval;
  priceMinor: number;
  /** Days free before the first payment (0: pays at once). */
  trialDays: number;
  /** A hidden plan takes no new members; its members stay. */
  hidden: boolean;
  /** Whole percent off the shop's products for its members at checkout (0: none). The server applies it (M2a). */
  memberPercent: number;
  /** Ships a box every month (M3): missing for a plan without one. */
  box?: PlanBox;
  /** Can be given as a gift for a set number of months, paid once (M5). Never on a box plan. */
  gifts?: boolean;
};

export const PLAN_MESSAGES = Object.freeze({
  name: "Give the plan a name.",
  interval: "Choose monthly or yearly.",
  price: (min: string, max: string) => `Enter a price from ${min} to ${max}.`,
  trial: `A free trial can be up to ${MAX_TRIAL_DAYS} days.`,
  percent: `A member price can take 0 to ${MAX_MEMBER_PERCENT}% off.`,
  boxItems: "Pick at least one product for the box.",
  boxQuantity: `Each product in the box can be 1 to ${MAX_BOX_QUANTITY}.`,
  cutoff: `Choose a cut-off day from 1 to ${MAX_CUTOFF_DAY}.`,
});

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** A plan's box, cleaned, or the problem. `undefined` or `null` (no box) gives null. Pure. */
export function cleanBox(raw: unknown): { box: PlanBox | null } | { problem: string } {
  if (raw === undefined || raw === null || raw === false) return { box: null };
  const b = typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const items: BoxItem[] = [];
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, MAX_BOX_ITEMS)) {
    const x = it && typeof it === "object" ? (it as Record<string, unknown>) : {};
    const bookId = typeof x.bookId === "string" && DOC_ID.test(x.bookId) ? x.bookId : "";
    if (!bookId) continue;
    const variantId = typeof x.variantId === "string" && DOC_ID.test(x.variantId) ? x.variantId : "";
    const quantity = x.quantity === undefined || x.quantity === "" ? 1 : Number(x.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_BOX_QUANTITY) return { problem: PLAN_MESSAGES.boxQuantity };
    const same = items.find((i) => i.bookId === bookId && (i.variantId || "") === variantId);
    if (same) { same.quantity = Math.min(MAX_BOX_QUANTITY, same.quantity + quantity); continue; }
    items.push({ bookId, ...(variantId ? { variantId } : {}), quantity });
  }
  if (!items.length) return { problem: PLAN_MESSAGES.boxItems };
  const cutoffDay = Number(b.cutoffDay);
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > MAX_CUTOFF_DAY) return { problem: PLAN_MESSAGES.cutoff };
  return { box: { items, cutoffDay } };
}

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The owner's plan, cleaned, or the first problem with the field it is about. Prices are whole cents. Pure. */
export function cleanPlan(raw: unknown): { plan: MembershipPlan } | { problem: string; field: "name" | "interval" | "price" | "trial" | "percent" | "box" } {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name = text(p.name, MAX_PLAN_NAME);
  if (!name) return { problem: PLAN_MESSAGES.name, field: "name" };
  const interval = p.interval === "year" ? "year" : p.interval === "month" ? "month" : null;
  if (!interval) return { problem: PLAN_MESSAGES.interval, field: "interval" };
  const priceMinor = Number(p.priceMinor);
  if (!Number.isInteger(priceMinor) || priceMinor < MIN_PLAN_MINOR || priceMinor > MAX_PLAN_MINOR) {
    return { problem: PLAN_MESSAGES.price(`$${(MIN_PLAN_MINOR / 100).toFixed(2)}`, `$${(MAX_PLAN_MINOR / 100).toLocaleString("en-CA")}`), field: "price" };
  }
  const trialDays = p.trialDays === undefined || p.trialDays === "" || p.trialDays === null ? 0 : Number(p.trialDays);
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > MAX_TRIAL_DAYS) return { problem: PLAN_MESSAGES.trial, field: "trial" };
  const memberPercent = p.memberPercent === undefined || p.memberPercent === "" || p.memberPercent === null ? 0 : Number(p.memberPercent);
  if (!Number.isInteger(memberPercent) || memberPercent < 0 || memberPercent > MAX_MEMBER_PERCENT) return { problem: PLAN_MESSAGES.percent, field: "percent" };
  const perks = (Array.isArray(p.perks) ? p.perks : []).map((x) => text(x, MAX_PERK)).filter(Boolean).slice(0, MAX_PERKS);
  const boxed = cleanBox(p.box);
  if ("problem" in boxed) return { problem: boxed.problem, field: "box" };
  return { plan: { name, description: String(p.description ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_PLAN_DESCRIPTION), perks, interval, priceMinor, trialDays, hidden: p.hidden === true, memberPercent, ...(boxed.box ? { box: boxed.box } : p.gifts === true ? { gifts: true } : {}) } };
}

// ── Gift memberships (M5) ─────────────────────────────────────────────────────────────────────────────────────────
/** How many months a gift can be for. */
export const GIFT_MONTHS: readonly number[] = Object.freeze([3, 6, 12]);
export const MAX_GIFT_MESSAGE = 300;
export const MAX_GIFT_NAME = 100;
const EMAIL = /^[^\s@<>",;]{1,64}@[^\s@<>",;]{1,190}\.[A-Za-z]{2,24}$/;

/** What a gift of `months` costs, paid once: the plan's monthly price that many times (a yearly plan by twelfths). Pure. */
export function giftPriceMinor(plan: Pick<MembershipPlan, "interval" | "priceMinor">, months: number) {
  if (!GIFT_MONTHS.includes(months) || !Number.isInteger(plan?.priceMinor) || plan.priceMinor <= 0) return 0;
  return plan.interval === "year" ? Math.round((plan.priceMinor * months) / 12) : plan.priceMinor * months;
}

export const GIFT_MESSAGES = Object.freeze({
  months: "Choose 3, 6 or 12 months.",
  email: "Enter the email address of the person the gift is for.",
  self: "A gift is for someone else. To join yourself, choose Join.",
});

export type GiftRequest = { months: number; to: { email: string; name: string }; message: string };

/** A gift as the buyer typed it, cleaned, or the first problem. `buyerEmail` keeps a gift from going to the buyer. Pure. */
export function cleanGift(raw: unknown, buyerEmail = ""): { gift: GiftRequest } | { problem: string; field: string } {
  const g = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const months = Number(g.months);
  if (!GIFT_MONTHS.includes(months)) return { problem: GIFT_MESSAGES.months, field: "months" };
  const email = String(g.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) return { problem: GIFT_MESSAGES.email, field: "email" };
  if (buyerEmail && email === String(buyerEmail).trim().toLowerCase()) return { problem: GIFT_MESSAGES.self, field: "email" };
  const name = text(g.name, MAX_GIFT_NAME);
  const message = String(g.message ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, MAX_GIFT_MESSAGE);
  return { gift: { months, to: { email, name }, message } };
}

/** The day a gift of `months` from `startIso` ends: the same day of the month, clamped to the month's last day. Pure. */
export function giftEnd(startIso: string, months: number) {
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(months) || months <= 0) return "";
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), last));
  return end.toISOString();
}

/**
 * Where a member stands:
 *   pending   the card page is open and nothing is paid yet
 *   trial     in the free trial
 *   active    paid up
 *   pastDue   a payment failed; the card provider is trying again and the member keeps their perks meanwhile
 *   ending    asked to end; perks last to the end of the paid period
 *   ended     over (ended at the period's end, ended at once, or never paid)
 */
export type MemberState = "pending" | "trial" | "active" | "pastDue" | "ending" | "paused" | "ended";

/** A member's state from the provider's subscription status (Stripe's words). Pure. */
export function memberState(status: unknown, cancelAtPeriodEnd = false, pausedForever = false): MemberState {
  // Paused by the member (M3c): payments held with no end date. A skipped month has an end date and stays active.
  if (pausedForever && !cancelAtPeriodEnd && (status === "active" || status === "trialing")) return "paused";
  switch (String(status || "")) {
    case "trialing": return cancelAtPeriodEnd ? "ending" : "trial";
    case "active": return cancelAtPeriodEnd ? "ending" : "active";
    case "past_due":
    case "unpaid":
    case "paused": return "pastDue";
    case "incomplete": return "pending";
    case "incomplete_expired":
    case "canceled": return "ended";
    default: return "pending";
  }
}

/** Whether a member gets their perks now: a trial, paid up, ending later, or a failed payment still being retried. */
export const hasPerks = (state: MemberState) => state === "trial" || state === "active" || state === "ending" || state === "pastDue";

/** Whether this person may join again: only once their last membership has ended (or never started). */
export const mayJoin = (states: readonly MemberState[]) => states.every((s) => s === "ended" || s === "pending");

/** "$15.00 a month", "$150.00 a year" (English) or "15,00 $ par mois" (French). Pure. */
export function planPriceWords(priceMinor: number, interval: PlanInterval, currency = "CAD", locale = "en-CA") {
  const fr = /^fr/i.test(locale);
  const money = new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(priceMinor / 100);
  if (fr) return `${money} par ${interval === "year" ? "année" : "mois"}`;
  return `${money} a ${interval}`;
}

/**
 * A product's member price: the shop's unit price less the plan's percent, to the cent (rounded half up), never below
 * zero. 0 percent, or a price that isn't a number, gives the price back. Pure; the server uses it in priceOrder (M2a).
 */
export function memberUnitPrice(price: number, percent: number): number {
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(percent) || percent <= 0) return price;
  const cents = Math.round(price * 100);
  return Math.max(0, Math.round(cents * (100 - Math.min(percent, MAX_MEMBER_PERCENT)) / 100)) / 100;
}

const DIGITAL_FORMAT = /digital|e-book|ebook|epub|pdf|audiobook/i;
/**
 * Free for members (Memberships M2b): a download the owner gives to members at no cost. Only downloads count: the
 * chosen edition must be digital, or, with none chosen, the product itself. The server prices it; the page only says so.
 */
export function memberFreeProduct(book: any, variant?: any): boolean {
  if (!book || book.memberFree !== true) return false;
  if (variant) return variant.digital === true || variant.isDigital === true;
  return book.digital === true || book.isDigital === true || DIGITAL_FORMAT.test(String(book.format || ""));
}

/** A box member's address, as the card provider or the member gave it, cleaned; null when it can't take a parcel. Pure. */
export type BoxAddress = { name: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
export function cleanBoxAddress(raw: unknown): BoxAddress | null {
  const a = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const field = (v: unknown, max: number) => text(v, max);
  const country = field(a.country, 2).toUpperCase();
  const out = { name: field(a.name, 100), line1: field(a.line1, 120), line2: field(a.line2, 120), city: field(a.city, 80), state: field(a.state, 40).toUpperCase(), postalCode: field(a.postalCode ?? a.postal_code, 12).toUpperCase(), country };
  if (!out.name || !out.line1 || !out.city || !out.postalCode || !BOX_COUNTRIES.includes(country)) return null;
  return out;
}

/** "2026-12": the month a box belongs to, on the shop's clock. Pure. */
export function boxMonth(nowMs: number, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit" }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}`;
}

/** The day of the month on the shop's clock (1 to 31). Pure. */
export function shopDayOfMonth(nowMs: number, zone: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: zone, day: "numeric" }).format(new Date(nowMs)));
}

/** Who gets this month's box: paid members only (not a free trial, not a payment being retried). */
export const getsBox = (state: MemberState) => state === "active" || state === "ending";

/** The shop-clock hour (0 to 23). Pure. */
export function shopHour(nowMs: number, zone: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(new Date(nowMs))) % 24;
}

/**
 * Whether a member was paid up by this month's cut-off: their paid time (the trial's end, else the start) is before the
 * cut-off day's end in `month`. Someone who started paying after the cut-off gets next month's box. Pure.
 */
export function paidByCutoff(m: { trialEnd?: string; startedAt?: string }, month: string, cutoffDay: number, zone: string): boolean {
  const from = Date.parse(m.trialEnd || m.startedAt || "");
  if (!Number.isFinite(from)) return true;
  const fromMonth = boxMonth(from, zone);
  if (fromMonth < month) return true;
  if (fromMonth > month) return false;
  return shopDayOfMonth(from, zone) <= cutoffDay;
}

/** The days the owner hears about short stock: the three days before the cut-off. Pure. */
export const inStockWarning = (day: number, cutoffDay: number) => day < cutoffDay && day >= cutoffDay - 3;

export type BoxStockBook = { title?: string; trackInventory?: boolean; allowBackorder?: boolean; stockLevel?: number; variants?: { id: string; name?: string; stockLevel?: number; stock?: number }[] } | null;
export type BoxShortLine = { bookId: string; variantId: string; title: string; need: number; have: number };

/**
 * What this month's boxes need that the shelf doesn't have: for each box line, members × quantity against the counted
 * stock. A product not counted (stock not tracked, or backorders allowed) is never short; a missing one has 0. Pure.
 */
export function boxShortfall(items: BoxItem[], members: number, getBook: (id: string) => BoxStockBook): BoxShortLine[] {
  if (!(members > 0)) return [];
  const need = new Map<string, BoxShortLine>();
  for (const item of items) {
    const key = `${item.bookId}|${item.variantId || ""}`;
    const book = getBook(item.bookId);
    const variant = item.variantId ? (book?.variants || []).find((v) => v.id === item.variantId) : null;
    const title = [book?.title || "A product that was removed", variant?.name].filter(Boolean).join(", ");
    const counted = !book || (book.trackInventory === true && book.allowBackorder !== true);
    if (!counted) continue;
    const have = !book ? 0 : item.variantId ? Math.max(0, Number(variant ? (variant.stockLevel ?? variant.stock) : 0) || 0) : Math.max(0, Number(book.stockLevel) || 0);
    const line = need.get(key) || { bookId: item.bookId, variantId: item.variantId || "", title, need: 0, have };
    line.need += members * item.quantity;
    need.set(key, line);
  }
  return [...need.values()].filter((l) => l.need > l.have);
}

/** "15th": a day of the month in words. Pure. */
export const dayOrdinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/**
 * The box month a "Skip next box" applies to (M3c): this month while its cut-off is still to come (shop time), else
 * next month. Pure.
 */
export function nextBoxMonth(nowMs: number, cutoffDay: number, zone: string): string {
  const month = boxMonth(nowMs, zone);
  if (shopDayOfMonth(nowMs, zone) < cutoffDay) return month;
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Whether a member may skip or pause now (M3c): only while paid up and not set to end. */
export const mayPause = (state: MemberState) => state === "active";
