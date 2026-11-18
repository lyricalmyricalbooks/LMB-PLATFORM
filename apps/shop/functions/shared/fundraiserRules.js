// GENERATED from src/shared/fundraiserRules.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wallWithout = exports.rewardsWithTaken = exports.rewardsLeft = exports.MAX_REWARD_LIMIT = exports.MAX_REWARD_WHEN = exports.MAX_REWARD_TEXT = exports.MAX_REWARD_TITLE = exports.MIN_REWARD_MINOR = exports.MAX_REWARDS = exports.MAX_DAYS = exports.MAX_WALL = exports.MAX_STORY = exports.MAX_TITLE = exports.MAX_GOAL_MINOR = exports.MIN_GOAL_MINOR = void 0;
exports.dayAfter = dayAfter;
exports.cleanRewards = cleanRewards;
exports.rewardProblem = rewardProblem;
exports.cleanShipTo = cleanShipTo;
exports.cleanFundraiser = cleanFundraiser;
exports.fundraiserState = fundraiserState;
exports.daysLeft = daysLeft;
exports.goalProgress = goalProgress;
exports.wallWith = wallWith;
exports.publicFundraiser = publicFundraiser;
// Fundraisers (Donations & tips beta, G2; LMB-PLATFORM tasks/todo/2026-11-18-giving-g2.md): a goal, an end day and a
// story on the shop's Support page. One fundraiser runs at a time. Gifts given to it count toward the goal: the server
// adds each one as it is paid (functions/giving.js), so the total can't be faked from a browser. Pure, shared by the
// admin, the Support page and the server (functions/shared copy).
const addressRules_1 = require("./addressRules");
exports.MIN_GOAL_MINOR = 10_000;
exports.MAX_GOAL_MINOR = 100_000_000;
exports.MAX_TITLE = 80;
exports.MAX_STORY = 5000;
/** Supporters shown on the wall, newest first (each one asked to be shown). */
exports.MAX_WALL = 60;
/** A fundraiser runs for at most this many days. */
exports.MAX_DAYS = 366;
/** Thank-you rewards (G2b): at most this many per fundraiser, each for a gift of at least MIN_REWARD_MINOR. */
exports.MAX_REWARDS = 8;
exports.MIN_REWARD_MINOR = 500;
exports.MAX_REWARD_TITLE = 80;
exports.MAX_REWARD_TEXT = 300;
exports.MAX_REWARD_WHEN = 40;
/** A reward's limit is at most this many (0 = no limit). */
exports.MAX_REWARD_LIMIT = 100_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max);
const whole = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);
/** The day `n` days after a YYYY-MM-DD day (UTC arithmetic, so no clock change moves it). */
function dayAfter(day, n) {
    const ms = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
}
const REWARD_ID = /^rw[a-z0-9]{1,10}$/;
const storedRewards = (list) => (Array.isArray(list) ? list.filter((r) => r && typeof r === "object" && REWARD_ID.test(String(r.id))) : []);
/**
 * The owner's rewards, cleaned against what is stored (`before`): each keeps the server's `taken`, a reward someone has
 * taken can't be removed and its limit can't go below what was taken. New rows get the next free id.
 */
function cleanRewards(raw, before = []) {
    const stored = storedRewards(before);
    const rows = Array.isArray(raw) ? raw : [];
    if (rows.length > exports.MAX_REWARDS)
        return { problem: `A fundraiser can have ${exports.MAX_REWARDS} rewards at most.`, field: "rewards" };
    const used = new Set(stored.map((r) => r.id));
    let next = 1;
    const freshId = () => {
        while (used.has(`rw${next}`))
            next += 1;
        used.add(`rw${next}`);
        return `rw${next}`;
    };
    const out = [];
    for (const row of rows) {
        const r = (row && typeof row === "object" ? row : {});
        const old = stored.find((s) => s.id === r.id);
        const title = text(r.title, exports.MAX_REWARD_TITLE).replace(/\s+/g, " ");
        if (title.length < 2)
            return { problem: "Give each reward a name.", field: "rewards" };
        const minMinor = whole(r.minMinor);
        if (!Number.isFinite(minMinor) || minMinor < exports.MIN_REWARD_MINOR)
            return { problem: `"${title}" needs a gift of at least 5.`, field: "rewards" };
        if (minMinor > exports.MAX_GOAL_MINOR)
            return { problem: `"${title}" asks for more than a gift can be.`, field: "rewards" };
        const limit = r.limit === "" || r.limit == null ? 0 : whole(typeof r.limit === "string" && /^\d+$/.test(r.limit.trim()) ? Number(r.limit) : r.limit);
        if (!Number.isFinite(limit) || limit < 0 || limit > exports.MAX_REWARD_LIMIT)
            return { problem: `Check how many of "${title}" there are.`, field: "rewards" };
        const taken = Math.max(0, Number(old?.taken) || 0);
        if (limit > 0 && limit < taken)
            return { problem: `${taken} people already chose "${title}", so there must be at least ${taken}.`, field: "rewards" };
        out.push({
            id: old ? old.id : freshId(), title, description: text(r.description, exports.MAX_REWARD_TEXT), minMinor, limit,
            ships: r.ships === true, when: text(r.when, exports.MAX_REWARD_WHEN).replace(/\s+/g, " "), taken,
        });
    }
    const kept = new Set(out.map((r) => r.id));
    const lost = stored.find((r) => !kept.has(r.id) && (Number(r.taken) || 0) > 0);
    if (lost)
        return { problem: `Someone already chose "${lost.title}", so it can't be removed. Set how many there are to stop more.`, field: "rewards" };
    return out;
}
/** How many of a reward are left (null = no limit). */
const rewardsLeft = (r) => (r.limit > 0 ? Math.max(0, r.limit - (Number(r.taken) || 0)) : null);
exports.rewardsLeft = rewardsLeft;
/** Whether a gift may take this reward now, or why not (`code` reward_gone / reward_min / reward_unknown). */
function rewardProblem(rewards, id, amountMinor) {
    const reward = storedRewards(rewards).find((r) => r.id === id);
    if (!reward)
        return { problem: "That reward isn't offered any more. Reload the page to see what's left.", code: "reward_unknown" };
    if ((0, exports.rewardsLeft)(reward) === 0)
        return { problem: `"${reward.title}" is all gone. Pick another, or give without one.`, code: "reward_gone" };
    if (!(amountMinor >= reward.minMinor))
        return { problem: `"${reward.title}" is for gifts of ${(reward.minMinor / 100).toFixed(2)} or more.`, code: "reward_min" };
    return { reward };
}
/** The rewards with one reward's count moved by `delta` (never below 0). */
const rewardsWithTaken = (rewards, id, delta) => storedRewards(rewards).map((r) => (r.id === id ? { ...r, taken: Math.max(0, (Number(r.taken) || 0) + delta) } : r));
exports.rewardsWithTaken = rewardsWithTaken;
/** The giver's address for a posted reward, cleaned, or what is missing. */
function cleanShipTo(raw) {
    const r = (raw && typeof raw === "object" ? raw : {});
    const line = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const a = { name: line(r.name, 80), street: line(r.street, 120), street2: line(r.street2, 120), city: line(r.city, 80), state: line(r.state, 60), zip: line(r.zip, 20), country: line(r.country, 60) };
    if (!a.name || (0, addressRules_1.addressMissing)(a).length)
        return { problem: "Fill in the address we should post your reward to.", code: "address" };
    return a;
}
/** The owner's form, cleaned, or why it can't be saved. `today` is the shop's own day (YYYY-MM-DD). */
function cleanFundraiser(raw, today, beforeRewards = []) {
    const r = (raw && typeof raw === "object" ? raw : {});
    const title = text(r.title, exports.MAX_TITLE).replace(/\s+/g, " ");
    if (title.length < 3)
        return { problem: "Give the fundraiser a name.", field: "title" };
    const story = text(r.story, exports.MAX_STORY);
    const goalMinor = whole(r.goalMinor);
    if (!Number.isFinite(goalMinor) || goalMinor < exports.MIN_GOAL_MINOR)
        return { problem: "Set a goal of at least 100.", field: "goal" };
    if (goalMinor > exports.MAX_GOAL_MINOR)
        return { problem: "Set a goal of at most 1,000,000.", field: "goal" };
    const endsOn = String(r.endsOn ?? "");
    if (!DAY.test(endsOn) || Number.isNaN(Date.parse(`${endsOn}T00:00:00Z`)))
        return { problem: "Pick the last day of the fundraiser.", field: "endsOn" };
    if (endsOn < today)
        return { problem: "The last day can't be in the past.", field: "endsOn" };
    if (endsOn > dayAfter(today, exports.MAX_DAYS))
        return { problem: "A fundraiser can run for a year at most.", field: "endsOn" };
    const rewards = cleanRewards(r.rewards, beforeRewards);
    if (!Array.isArray(rewards))
        return rewards;
    return { title, story, goalMinor, endsOn, wall: r.wall !== false, rewards };
}
/** Draft until started, live until the end of its last day (the shop's day) or until ended early. */
function fundraiserState(f, today) {
    if (f.status === "draft")
        return "draft";
    if (f.status === "ended")
        return "ended";
    return typeof f.endsOn === "string" && f.endsOn >= today ? "live" : "ended";
}
/** Whole days left, counting today; 0 once it has ended. */
function daysLeft(endsOn, today) {
    if (!DAY.test(endsOn) || endsOn < today)
        return 0;
    return Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) + 1;
}
/** How far along, 0 to 100 for the bar (a goal passed shows full), and the real percent for the words. */
function goalProgress(raisedMinor, goalMinor) {
    if (!(goalMinor > 0))
        return { bar: 0, percent: 0 };
    const percent = Math.floor((Math.max(0, raisedMinor) / goalMinor) * 100);
    return { bar: Math.min(100, percent), percent };
}
/** The wall after a gift: newest first, one line per gift, at most MAX_WALL. */
function wallWith(wall, entry) {
    return [entry, ...wall.filter((w) => w.gift !== entry.gift)].slice(0, exports.MAX_WALL);
}
/** The wall without a refunded gift. */
const wallWithout = (wall, gift) => wall.filter((w) => w.gift !== gift);
exports.wallWithout = wallWithout;
/** A stored fundraiser as anyone may see it: never gift ids or emails. */
function publicFundraiser(id, f, today) {
    const showWall = f.wall !== false;
    const wall = showWall && Array.isArray(f.wallEntries) ? f.wallEntries.map((w) => ({ name: String(w?.name || ""), at: String(w?.at || "") })).filter((w) => w.name) : [];
    return {
        id, title: String(f.title || ""), story: String(f.story || ""), goalMinor: Number(f.goalMinor) || 0, raisedMinor: Math.max(0, Number(f.raisedMinor) || 0),
        supporters: Math.max(0, Number(f.supporters) || 0), endsOn: String(f.endsOn || ""), state: fundraiserState(f, today), wall, showWall,
        rewards: storedRewards(f.rewards).map((r) => {
            const left = (0, exports.rewardsLeft)(r);
            return { id: r.id, title: String(r.title || ""), description: String(r.description || ""), minMinor: Number(r.minMinor) || 0, ships: r.ships === true, when: String(r.when || ""), left, gone: left === 0 };
        }),
    };
}
