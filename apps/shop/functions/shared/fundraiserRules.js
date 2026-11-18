// GENERATED from src/shared/fundraiserRules.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Fundraisers (Donations & tips beta, G2; LMB-PLATFORM tasks/todo/2026-11-18-giving-g2.md): a goal, an end day and a
// story on the shop's Support page. One fundraiser runs at a time. Gifts given to it count toward the goal: the server
// adds each one as it is paid (functions/giving.js), so the total can't be faked from a browser. Pure, shared by the
// admin, the Support page and the server (functions/shared copy).
Object.defineProperty(exports, "__esModule", { value: true });
exports.wallWithout = exports.MAX_DAYS = exports.MAX_WALL = exports.MAX_STORY = exports.MAX_TITLE = exports.MAX_GOAL_MINOR = exports.MIN_GOAL_MINOR = void 0;
exports.dayAfter = dayAfter;
exports.cleanFundraiser = cleanFundraiser;
exports.fundraiserState = fundraiserState;
exports.daysLeft = daysLeft;
exports.goalProgress = goalProgress;
exports.wallWith = wallWith;
exports.publicFundraiser = publicFundraiser;
exports.MIN_GOAL_MINOR = 10_000;
exports.MAX_GOAL_MINOR = 100_000_000;
exports.MAX_TITLE = 80;
exports.MAX_STORY = 5000;
/** Supporters shown on the wall, newest first (each one asked to be shown). */
exports.MAX_WALL = 60;
/** A fundraiser runs for at most this many days. */
exports.MAX_DAYS = 366;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max);
const whole = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);
/** The day `n` days after a YYYY-MM-DD day (UTC arithmetic, so no clock change moves it). */
function dayAfter(day, n) {
    const ms = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
}
/** The owner's form, cleaned, or why it can't be saved. `today` is the shop's own day (YYYY-MM-DD). */
function cleanFundraiser(raw, today) {
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
    return { title, story, goalMinor, endsOn, wall: r.wall !== false };
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
    };
}
