// GENERATED from src/shared/loyalty.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Loyalty points (Bookings plan 4, step 5.5): one copy of the rules for the admin and the server.
// Clients earn points on visits that happened and on paid shop orders; at `rewardPoints` the server turns points into a
// one-use discount code worth `rewardMinor`, emailed to the client (functions/bookings.js `sweepLoyalty`). Pure: no
// Firebase, no clock of its own.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ADJUST_POINTS = exports.MAX_REWARDS_AT_ONCE = exports.LOYALTY_WINDOW_DAYS = exports.REWARD_DAY_CHOICES = exports.BONUS_TIMES = exports.MAX_BONUS_WEEKS = exports.LOYALTY_DEFAULTS = void 0;
exports.cleanBonusWeeks = cleanBonusWeeks;
exports.cleanLoyalty = cleanLoyalty;
exports.loyaltyEarns = loyaltyEarns;
exports.bonusTimes = bonusTimes;
exports.visitPoints = visitPoints;
exports.orderPoints = orderPoints;
exports.rewardsDue = rewardsDue;
exports.pointsToNext = pointsToNext;
exports.cleanAdjust = cleanAdjust;
exports.rewardCode = rewardCode;
exports.LOYALTY_DEFAULTS = Object.freeze({
    on: false, perDollar: 1, perVisit: 0, onOrders: true, rewardPoints: 100, rewardMinor: 1000, rewardDays: 180, bonusWeeks: [],
});
exports.MAX_BONUS_WEEKS = 6;
exports.BONUS_TIMES = [2, 3];
exports.REWARD_DAY_CHOICES = [30, 90, 180, 365];
/** Visits and orders older than this never earn: switching points on doesn't reward the past all at once. */
exports.LOYALTY_WINDOW_DAYS = 7;
/** At most this many rewards come out of one earning, so a large hand-made adjustment can't flood a client with codes. */
exports.MAX_REWARDS_AT_ONCE = 3;
/** The most points one adjustment can add or take. */
exports.MAX_ADJUST_POINTS = 100000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const whole = (value, min, max, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
/** A real calendar day "YYYY-MM-DD" (Feb 30 is refused). */
function isRealDay(value) {
    if (typeof value !== "string" || !DAY.test(value))
        return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
/** Bonus stretches as saved: real days, from ≤ to, at most 62 days long, double or triple, at most MAX_BONUS_WEEKS, by start. */
function cleanBonusWeeks(value) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    for (const raw of value) {
        const w = raw;
        if (!w || !isRealDay(w.from) || !isRealDay(w.to) || w.from > w.to)
            continue;
        const span = (Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${w.from}T00:00:00Z`)) / 86400000;
        if (span > 61)
            continue;
        const times = exports.BONUS_TIMES.includes(Number(w.times)) ? Number(w.times) : 2;
        out.push({ from: w.from, to: w.to, times });
        if (out.length >= exports.MAX_BONUS_WEEKS)
            break;
    }
    return out.sort((a, b) => a.from.localeCompare(b.from));
}
/** The settings as saved, every number inside its limits. Anything missing takes the default. */
function cleanLoyalty(value) {
    const v = (value && typeof value === "object" ? value : {});
    return {
        on: v.on === true,
        perDollar: whole(v.perDollar, 0, 20, exports.LOYALTY_DEFAULTS.perDollar),
        perVisit: whole(v.perVisit, 0, 1000, exports.LOYALTY_DEFAULTS.perVisit),
        onOrders: v.onOrders !== false,
        rewardPoints: whole(v.rewardPoints, 10, 100000, exports.LOYALTY_DEFAULTS.rewardPoints),
        rewardMinor: whole(v.rewardMinor, 100, 100000, exports.LOYALTY_DEFAULTS.rewardMinor),
        rewardDays: exports.REWARD_DAY_CHOICES.includes(Number(v.rewardDays)) ? Number(v.rewardDays) : exports.LOYALTY_DEFAULTS.rewardDays,
        bonusWeeks: cleanBonusWeeks(v.bonusWeeks),
    };
}
/** Does anything earn points? On, and at least one way to earn. */
function loyaltyEarns(s) {
    return s.on && (s.perDollar > 0 || s.perVisit > 0);
}
/** How many times points count on `day` (the shop's own day): the biggest bonus stretch holding it, else 1. */
function bonusTimes(s, day) {
    return s.bonusWeeks.reduce((best, w) => (day >= w.from && day <= w.to ? Math.max(best, w.times) : best), 1);
}
/** Points for a paid visit: whole dollars × perDollar, plus perVisit, all times the day's bonus. Never negative. */
function visitPoints(s, paidMinor, day) {
    if (!loyaltyEarns(s))
        return 0;
    const dollars = Math.floor(Math.max(0, Math.round(Number(paidMinor) || 0)) / 100);
    return (dollars * s.perDollar + s.perVisit) * bonusTimes(s, day);
}
/** Points for a paid shop order (no visit bonus). Zero while orders don't earn. */
function orderPoints(s, paidMinor, day) {
    if (!loyaltyEarns(s) || !s.onOrders)
        return 0;
    const dollars = Math.floor(Math.max(0, Math.round(Number(paidMinor) || 0)) / 100);
    return dollars * s.perDollar * bonusTimes(s, day);
}
/** How many rewards a balance pays out now (at most MAX_REWARDS_AT_ONCE), and the balance left after them. */
function rewardsDue(s, balance) {
    const pts = Math.max(0, Math.floor(Number(balance) || 0));
    if (!s.on || s.rewardPoints <= 0)
        return { rewards: 0, left: pts };
    const rewards = Math.min(exports.MAX_REWARDS_AT_ONCE, Math.floor(pts / s.rewardPoints));
    return { rewards, left: pts - rewards * s.rewardPoints };
}
/** Points still to earn before the next reward (0 when one is due). */
function pointsToNext(s, balance) {
    const pts = Math.max(0, Math.floor(Number(balance) || 0));
    if (s.rewardPoints <= 0)
        return 0;
    const over = pts % s.rewardPoints;
    return pts >= s.rewardPoints ? 0 : s.rewardPoints - over;
}
/** A hand-made change of points from the admin: a whole number, not zero, within ±MAX_ADJUST_POINTS. Null when wrong. */
function cleanAdjust(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0 || Math.abs(n) > exports.MAX_ADJUST_POINTS)
        return null;
    return n;
}
/** A reward code: "THANKS-" and six letters or digits from `random` (0 ≤ r < 1), skipping look-alikes (0/O, 1/I/L). */
function rewardCode(random) {
    const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i += 1)
        out += letters[Math.min(letters.length - 1, Math.floor(random() * letters.length))];
    return `THANKS-${out}`;
}
