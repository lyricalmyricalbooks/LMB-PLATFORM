// GENERATED from src/shared/membershipRules.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Memberships & subscriptions (beta; LMB-PLATFORM tasks/todo/2026-11-18-memberships-m1.md): what a plan may be and what
// a member's state means. One source for the admin, the shop's Membership page and account, and the server
// (functions/shared/membershipRules.js is a generated copy; functions/memberships.js keeps the records).
//
// A plan is paid every month or every year on the shop's own card account, with an optional free trial. A member's
// state comes from the card provider's subscription (memberState), never from the browser.
Object.defineProperty(exports, "__esModule", { value: true });
exports.mayJoin = exports.hasPerks = exports.PLAN_MESSAGES = exports.PLAN_INTERVALS = exports.MAX_MEMBER_PERCENT = exports.MAX_TRIAL_DAYS = exports.MAX_PLAN_MINOR = exports.MIN_PLAN_MINOR = exports.MAX_PERK = exports.MAX_PERKS = exports.MAX_PLAN_DESCRIPTION = exports.MAX_PLAN_NAME = exports.MAX_PLANS = void 0;
exports.cleanPlan = cleanPlan;
exports.memberState = memberState;
exports.planPriceWords = planPriceWords;
exports.memberUnitPrice = memberUnitPrice;
exports.memberFreeProduct = memberFreeProduct;
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
exports.PLAN_INTERVALS = Object.freeze(["month", "year"]);
exports.PLAN_MESSAGES = Object.freeze({
    name: "Give the plan a name.",
    interval: "Choose monthly or yearly.",
    price: (min, max) => `Enter a price from ${min} to ${max}.`,
    trial: `A free trial can be up to ${exports.MAX_TRIAL_DAYS} days.`,
    percent: `A member price can take 0 to ${exports.MAX_MEMBER_PERCENT}% off.`,
});
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
    return { plan: { name, description: String(p.description ?? "").replace(/\r\n?/g, "\n").trim().slice(0, exports.MAX_PLAN_DESCRIPTION), perks, interval, priceMinor, trialDays, hidden: p.hidden === true, memberPercent } };
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
