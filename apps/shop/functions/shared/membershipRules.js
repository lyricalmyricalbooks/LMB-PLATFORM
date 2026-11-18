// GENERATED from src/shared/membershipRules.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Memberships & subscriptions (beta; LMB-PLATFORM tasks/todo/2026-11-18-memberships-m1.md): what a plan may be and what
// a member's state means. One source for the admin, the shop's Membership page and account, and the server
// (functions/shared/membershipRules.js is a generated copy; functions/memberships.js keeps the records).
//
// A plan is paid every month or every year on the shop's own card account, with an optional free trial. A member's
// state comes from the card provider's subscription (memberState), never from the browser.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getsBox = exports.mayJoin = exports.hasPerks = exports.PLAN_MESSAGES = exports.PLAN_INTERVALS = exports.BOX_COUNTRIES = exports.MAX_CUTOFF_DAY = exports.MAX_BOX_QUANTITY = exports.MAX_BOX_ITEMS = exports.MAX_MEMBER_PERCENT = exports.MAX_TRIAL_DAYS = exports.MAX_PLAN_MINOR = exports.MIN_PLAN_MINOR = exports.MAX_PERK = exports.MAX_PERKS = exports.MAX_PLAN_DESCRIPTION = exports.MAX_PLAN_NAME = exports.MAX_PLANS = void 0;
exports.cleanBox = cleanBox;
exports.cleanPlan = cleanPlan;
exports.memberState = memberState;
exports.planPriceWords = planPriceWords;
exports.memberUnitPrice = memberUnitPrice;
exports.memberFreeProduct = memberFreeProduct;
exports.cleanBoxAddress = cleanBoxAddress;
exports.boxMonth = boxMonth;
exports.shopDayOfMonth = shopDayOfMonth;
exports.MAX_PLANS = 8;
exports.MAX_PLAN_NAME = 60;
exports.MAX_PLAN_DESCRIPTION = 400;
exports.MAX_PERKS = 8;
exports.MAX_PERK = 100;
/** The lowest price: below this the card fee eats most of it. */
exports.MIN_PLAN_MINOR = 200;
/** The highest price one payment takes. */
exports.MAX_PLAN_MINOR = 500_000;
exports.MAX_TRIAL_DAYS = 60;
/** The most a plan can take off the shop's prices for its members (M2a). */
exports.MAX_MEMBER_PERCENT = 50;
/** Products in one plan's box (M3), and how many of each. */
exports.MAX_BOX_ITEMS = 10;
exports.MAX_BOX_QUANTITY = 10;
/** The latest cut-off day: every month has it. */
exports.MAX_CUTOFF_DAY = 28;
/** Where a box can be sent (the provider's own address step asks for these). */
exports.BOX_COUNTRIES = Object.freeze(["CA", "US"]);
exports.PLAN_INTERVALS = Object.freeze(["month", "year"]);
exports.PLAN_MESSAGES = Object.freeze({
    name: "Give the plan a name.",
    interval: "Choose monthly or yearly.",
    price: (min, max) => `Enter a price from ${min} to ${max}.`,
    trial: `A free trial can be up to ${exports.MAX_TRIAL_DAYS} days.`,
    percent: `A member price can take 0 to ${exports.MAX_MEMBER_PERCENT}% off.`,
    boxItems: "Pick at least one product for the box.",
    boxQuantity: `Each product in the box can be 1 to ${exports.MAX_BOX_QUANTITY}.`,
    cutoff: `Choose a cut-off day from 1 to ${exports.MAX_CUTOFF_DAY}.`,
});
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** A plan's box, cleaned, or the problem. `undefined` or `null` (no box) gives null. Pure. */
function cleanBox(raw) {
    if (raw === undefined || raw === null || raw === false)
        return { box: null };
    const b = typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const items = [];
    for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, exports.MAX_BOX_ITEMS)) {
        const x = it && typeof it === "object" ? it : {};
        const bookId = typeof x.bookId === "string" && DOC_ID.test(x.bookId) ? x.bookId : "";
        if (!bookId)
            continue;
        const variantId = typeof x.variantId === "string" && DOC_ID.test(x.variantId) ? x.variantId : "";
        const quantity = x.quantity === undefined || x.quantity === "" ? 1 : Number(x.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > exports.MAX_BOX_QUANTITY)
            return { problem: exports.PLAN_MESSAGES.boxQuantity };
        const same = items.find((i) => i.bookId === bookId && (i.variantId || "") === variantId);
        if (same) {
            same.quantity = Math.min(exports.MAX_BOX_QUANTITY, same.quantity + quantity);
            continue;
        }
        items.push({ bookId, ...(variantId ? { variantId } : {}), quantity });
    }
    if (!items.length)
        return { problem: exports.PLAN_MESSAGES.boxItems };
    const cutoffDay = Number(b.cutoffDay);
    if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > exports.MAX_CUTOFF_DAY)
        return { problem: exports.PLAN_MESSAGES.cutoff };
    return { box: { items, cutoffDay } };
}
const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** The owner's plan, cleaned, or the first problem with the field it is about. Prices are whole cents. Pure. */
function cleanPlan(raw) {
    const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const name = text(p.name, exports.MAX_PLAN_NAME);
    if (!name)
        return { problem: exports.PLAN_MESSAGES.name, field: "name" };
    const interval = p.interval === "year" ? "year" : p.interval === "month" ? "month" : null;
    if (!interval)
        return { problem: exports.PLAN_MESSAGES.interval, field: "interval" };
    const priceMinor = Number(p.priceMinor);
    if (!Number.isInteger(priceMinor) || priceMinor < exports.MIN_PLAN_MINOR || priceMinor > exports.MAX_PLAN_MINOR) {
        return { problem: exports.PLAN_MESSAGES.price(`$${(exports.MIN_PLAN_MINOR / 100).toFixed(2)}`, `$${(exports.MAX_PLAN_MINOR / 100).toLocaleString("en-CA")}`), field: "price" };
    }
    const trialDays = p.trialDays === undefined || p.trialDays === "" || p.trialDays === null ? 0 : Number(p.trialDays);
    if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > exports.MAX_TRIAL_DAYS)
        return { problem: exports.PLAN_MESSAGES.trial, field: "trial" };
    const memberPercent = p.memberPercent === undefined || p.memberPercent === "" || p.memberPercent === null ? 0 : Number(p.memberPercent);
    if (!Number.isInteger(memberPercent) || memberPercent < 0 || memberPercent > exports.MAX_MEMBER_PERCENT)
        return { problem: exports.PLAN_MESSAGES.percent, field: "percent" };
    const perks = (Array.isArray(p.perks) ? p.perks : []).map((x) => text(x, exports.MAX_PERK)).filter(Boolean).slice(0, exports.MAX_PERKS);
    const boxed = cleanBox(p.box);
    if ("problem" in boxed)
        return { problem: boxed.problem, field: "box" };
    return { plan: { name, description: String(p.description ?? "").replace(/\r\n?/g, "\n").trim().slice(0, exports.MAX_PLAN_DESCRIPTION), perks, interval, priceMinor, trialDays, hidden: p.hidden === true, memberPercent, ...(boxed.box ? { box: boxed.box } : {}) } };
}
/** A member's state from the provider's subscription status (Stripe's words). Pure. */
function memberState(status, cancelAtPeriodEnd = false) {
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
const hasPerks = (state) => state === "trial" || state === "active" || state === "ending" || state === "pastDue";
exports.hasPerks = hasPerks;
/** Whether this person may join again: only once their last membership has ended (or never started). */
const mayJoin = (states) => states.every((s) => s === "ended" || s === "pending");
exports.mayJoin = mayJoin;
/** "$15.00 a month", "$150.00 a year" (English) or "15,00 $ par mois" (French). Pure. */
function planPriceWords(priceMinor, interval, currency = "CAD", locale = "en-CA") {
    const fr = /^fr/i.test(locale);
    const money = new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(priceMinor / 100);
    if (fr)
        return `${money} par ${interval === "year" ? "année" : "mois"}`;
    return `${money} a ${interval}`;
}
/**
 * A product's member price: the shop's unit price less the plan's percent, to the cent (rounded half up), never below
 * zero. 0 percent, or a price that isn't a number, gives the price back. Pure; the server uses it in priceOrder (M2a).
 */
function memberUnitPrice(price, percent) {
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(percent) || percent <= 0)
        return price;
    const cents = Math.round(price * 100);
    return Math.max(0, Math.round(cents * (100 - Math.min(percent, exports.MAX_MEMBER_PERCENT)) / 100)) / 100;
}
const DIGITAL_FORMAT = /digital|e-book|ebook|epub|pdf|audiobook/i;
/**
 * Free for members (Memberships M2b): a download the owner gives to members at no cost. Only downloads count: the
 * chosen edition must be digital, or, with none chosen, the product itself. The server prices it; the page only says so.
 */
function memberFreeProduct(book, variant) {
    if (!book || book.memberFree !== true)
        return false;
    if (variant)
        return variant.digital === true || variant.isDigital === true;
    return book.digital === true || book.isDigital === true || DIGITAL_FORMAT.test(String(book.format || ""));
}
function cleanBoxAddress(raw) {
    const a = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const field = (v, max) => text(v, max);
    const country = field(a.country, 2).toUpperCase();
    const out = { name: field(a.name, 100), line1: field(a.line1, 120), line2: field(a.line2, 120), city: field(a.city, 80), state: field(a.state, 40).toUpperCase(), postalCode: field(a.postalCode ?? a.postal_code, 12).toUpperCase(), country };
    if (!out.name || !out.line1 || !out.city || !out.postalCode || !exports.BOX_COUNTRIES.includes(country))
        return null;
    return out;
}
/** "2026-12": the month a box belongs to, on the shop's clock. Pure. */
function boxMonth(nowMs, zone) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit" }).formatToParts(new Date(nowMs));
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}`;
}
/** The day of the month on the shop's clock (1 to 31). Pure. */
function shopDayOfMonth(nowMs, zone) {
    return Number(new Intl.DateTimeFormat("en-CA", { timeZone: zone, day: "numeric" }).format(new Date(nowMs)));
}
/** Who gets this month's box: paid members only (not a free trial, not a payment being retried). */
const getsBox = (state) => state === "active" || state === "ending";
exports.getsBox = getsBox;
