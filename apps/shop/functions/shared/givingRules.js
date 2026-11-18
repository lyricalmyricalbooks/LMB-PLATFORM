// GENERATED from src/shared/givingRules.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Donations & tips (beta; LMB-PLATFORM tasks/todo/2026-11-18-giving-g1.md): what the owner set up for giving, what a gift
// may be, what covering the card fee adds and who the giver is. One source for the admin, the shop's Support page and
// the server (functions/shared/givingRules.js is a generated copy; functions/giving.js keeps the records).
//
// A gift is money given, not something bought: it carries no sales tax, and the card page charges the gift plus the
// card fee when the giver chose to cover it. The lowest gift is MIN_GIFT_MINOR, so a stolen card can't be tried with a
// few cents (the server also limits how often one visitor or one email may open a card page).
Object.defineProperty(exports, "__esModule", { value: true });
exports.startingGivingSettings = exports.GIVING_MESSAGES = exports.MAX_THANKS = exports.MAX_TIP_MINOR = exports.MIN_TIP_MINOR = exports.MAX_TIP_CHOICES = exports.DEFAULT_TIP_PERCENTS = exports.MAX_NOTE = exports.CARD_FEE_FIXED_MINOR = exports.CARD_FEE_PERCENT = exports.DEFAULT_AMOUNTS = exports.MAX_AMOUNTS = exports.MAX_GIFT_MINOR = exports.MIN_GIFT_MINOR = void 0;
exports.centsOf = centsOf;
exports.cleanGivingSettings = cleanGivingSettings;
exports.cleanTipPercents = cleanTipPercents;
exports.tipChoices = tipChoices;
exports.checkoutTipProblem = checkoutTipProblem;
exports.giftAmountProblem = giftAmountProblem;
exports.coverFeeMinor = coverFeeMinor;
exports.giftCharge = giftCharge;
exports.cleanGiver = cleanGiver;
exports.giverShown = giverShown;
const charityReceipts_1 = require("./charityReceipts");
/** The lowest gift: small enough for anyone, too big for a run of stolen-card tries to go unnoticed. */
exports.MIN_GIFT_MINOR = 500;
/** The highest gift one card page takes. */
exports.MAX_GIFT_MINOR = 1_000_000;
/** How many suggested amounts the page shows. */
exports.MAX_AMOUNTS = 6;
exports.DEFAULT_AMOUNTS = Object.freeze([1000, 2500, 5000, 10000]);
/** The card fee a giver may cover: an estimate of the usual card rate, a percent plus a fixed part. */
exports.CARD_FEE_PERCENT = 2.9;
exports.CARD_FEE_FIXED_MINOR = 30;
exports.MAX_NOTE = 500;
/** Tips at checkout: the percents offered when the owner hasn't chosen, and the bounds of one tip. */
exports.DEFAULT_TIP_PERCENTS = Object.freeze([5, 10, 15]);
exports.MAX_TIP_CHOICES = 4;
exports.MIN_TIP_MINOR = 100;
exports.MAX_TIP_MINOR = 100_000;
exports.MAX_THANKS = 600;
exports.GIVING_MESSAGES = Object.freeze({
    off: "This shop isn't taking gifts right now.",
    tooSmall: (min) => `The lowest gift is ${min}.`,
    tooBig: (max) => `The highest gift is ${max}. For more, please contact the shop.`,
    amount: "Please choose an amount.",
    name: "Please add your name.",
    email: "Please add an email address we can send your thank-you to.",
    honourName: "Please add the name of the person you're giving for.",
});
const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const block = (value, max) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** A whole number of cents from what was typed or saved, or NaN. */
function centsOf(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? Math.round(value) : NaN;
    if (typeof value === "string" && /^\s*\d+\s*$/.test(value))
        return Number(value.trim());
    return NaN;
}
/** The owner's settings as saved, always usable: anything missing or out of range falls back to the defaults. */
function cleanGivingSettings(raw) {
    const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const list = Array.isArray(s.amounts) ? s.amounts : [];
    const amounts = [...new Set(list.map(centsOf).filter((n) => n >= exports.MIN_GIFT_MINOR && n <= exports.MAX_GIFT_MINOR))].sort((a, b) => a - b).slice(0, exports.MAX_AMOUNTS);
    const otherAmount = s.otherAmount !== false;
    return {
        // With no amounts and no other amount there would be nothing to give, so the defaults come back.
        amounts: amounts.length || otherAmount ? amounts : [...exports.DEFAULT_AMOUNTS],
        otherAmount,
        coverFee: s.coverFee !== false,
        honour: s.honour !== false,
        thanks: block(s.thanks, exports.MAX_THANKS),
        checkoutTip: s.checkoutTip === true,
        tipPercents: cleanTipPercents(s.tipPercents),
        charity: (() => { const c = (0, charityReceipts_1.cleanCharity)(s.charity); return "charity" in c ? c.charity : null; })(),
        yearlySummary: s.yearlySummary !== false,
    };
}
/** 1 to 4 whole percents from 1 to 50, smallest first; anything else is the defaults. */
function cleanTipPercents(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const percents = [...new Set(list.map(centsOf).filter((n) => n >= 1 && n <= 50))].sort((a, b) => a - b).slice(0, exports.MAX_TIP_CHOICES);
    return percents.length ? percents : [...exports.DEFAULT_TIP_PERCENTS];
}
/** Each tip choice in cents: that percent of the items (after any discount), rounded to the cent. */
function tipChoices(baseMinor, percents) {
    const base = Math.max(0, Math.round(Number(baseMinor) || 0));
    return percents.map((percent) => ({ percent, minor: Math.round((base * percent) / 100) }));
}
/** Why this tip can't be taken, or null. Nothing (0) is always fine; a tip is whole cents from $1 to $1,000. */
function checkoutTipProblem(tipMinor) {
    if (tipMinor === undefined || tipMinor === null || tipMinor === 0)
        return null;
    if (typeof tipMinor !== "number" || !Number.isInteger(tipMinor) || tipMinor < 0)
        return "tip";
    if (tipMinor < exports.MIN_TIP_MINOR)
        return "tipTooSmall";
    if (tipMinor > exports.MAX_TIP_MINOR)
        return "tipTooBig";
    return null;
}
/** The settings a shop starts with. */
const startingGivingSettings = () => ({ amounts: [...exports.DEFAULT_AMOUNTS], otherAmount: true, coverFee: true, honour: true, thanks: "", checkoutTip: false, tipPercents: [...exports.DEFAULT_TIP_PERCENTS], charity: null, yearlySummary: true });
exports.startingGivingSettings = startingGivingSettings;
/** Why this amount can't be given (`code` says which), or null. The settings decide whether a typed amount is allowed. */
function giftAmountProblem(amountMinor, settings) {
    const n = centsOf(amountMinor);
    if (!Number.isFinite(n) || n <= 0)
        return { code: "amount" };
    if (n < exports.MIN_GIFT_MINOR)
        return { code: "tooSmall" };
    if (n > exports.MAX_GIFT_MINOR)
        return { code: "tooBig" };
    if (!settings.otherAmount && !settings.amounts.includes(n))
        return { code: "amount" };
    return null;
}
/**
 * What covering the card fee adds to a gift, so that after the card company takes its part the shop has the whole gift:
 * (gift + fixed) / (1 − percent) − gift, rounded up to the cent.
 */
function coverFeeMinor(amountMinor) {
    const n = Math.round(Number(amountMinor) || 0);
    if (n <= 0)
        return 0;
    return Math.ceil((n + exports.CARD_FEE_FIXED_MINOR) / (1 - exports.CARD_FEE_PERCENT / 100)) - n;
}
/** What the card page charges: the gift, plus the card fee when the giver covers it and the shop offers that. */
function giftCharge(amountMinor, cover, settings) {
    const feeMinor = cover === true && settings.coverFee ? coverFeeMinor(amountMinor) : 0;
    return { amountMinor, feeMinor, chargedMinor: amountMinor + feeMinor };
}
/** The giver as sent from the page, or the problem in plain words. Honour only when the shop offers it. */
function cleanGiver(raw, settings) {
    const g = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const name = text(g.name, 100);
    if (!name)
        return { problem: exports.GIVING_MESSAGES.name, code: "name" };
    const email = text(g.email, 320).toLowerCase();
    if (!EMAIL.test(email))
        return { problem: exports.GIVING_MESSAGES.email, code: "email" };
    let honour = null;
    const h = g.honour && typeof g.honour === "object" ? g.honour : null;
    if (settings.honour && h && (h.kind === "honour" || h.kind === "memory")) {
        const who = text(h.name, 100);
        if (!who)
            return { problem: exports.GIVING_MESSAGES.honourName, code: "honour" };
        honour = { kind: h.kind, name: who };
    }
    return { name, email, anonymous: g.anonymous === true, honour, note: block(g.note, exports.MAX_NOTE) };
}
/** How a gift is shown to anyone but the owner: the giver's first name, or "Anonymous" when they asked. */
function giverShown(giver, anonymousWord = "Anonymous") {
    if (giver.anonymous)
        return anonymousWord;
    return giver.name.split(" ")[0] || anonymousWord;
}
