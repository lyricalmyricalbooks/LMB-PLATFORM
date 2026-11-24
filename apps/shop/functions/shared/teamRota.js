// GENERATED from src/shared/teamRota.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Shifts and time off (Bookings plan 4, 4.3, Beta). The owner plans who works when (the rota: planned shifts, one
// per person per stretch of a day), and the team asks for time off from their own desk, which the owner approves or
// declines. An approved request becomes days off (whole days) or blocked time (part of a day) for a person on Team &
// rooms, so clients can't book them then. Shared by the admin and the server (a generated copy in functions/shared/).
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotaMinutes = exports.MAX_NOTE = exports.MAX_ROTA_WEEK = exports.MAX_TIME_OFF_DAYS = void 0;
exports.daysBetween = daysBetween;
exports.cleanRotaShift = cleanRotaShift;
exports.cleanTimeOff = cleanTimeOff;
exports.timeOffWhen = timeOffWhen;
/** Longest stretch one request can cover. */
exports.MAX_TIME_OFF_DAYS = 60;
/** Planned shifts one week of the rota can hold. */
exports.MAX_ROTA_WEEK = 300;
exports.MAX_NOTE = 200;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDay = (v) => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const words = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const who = (s) => {
    const email = String(s.email || "").trim().toLowerCase();
    const staffId = typeof s.staffId === "string" && /^[\w-]{1,60}$/.test(s.staffId) ? s.staffId : "";
    return { email, name: words(s.name, 80) || email, ...(staffId ? { staffId } : {}) };
};
/** The days from `from` to `to`, both counted. */
function daysBetween(from, to) {
    const out = [];
    for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end && out.length <= exports.MAX_TIME_OFF_DAYS; t += 86_400_000) {
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
}
/** A planned shift as typed or sent, or what is wrong with it. A shift ends the day it starts. */
function cleanRotaShift(raw) {
    const s = (raw && typeof raw === "object" ? raw : {});
    const person = who(s);
    if (!EMAIL.test(person.email))
        return { error: "Pick who works this shift." };
    if (!isDay(s.day))
        return { error: "Pick the day." };
    const start = String(s.start || ""), end = String(s.end || "");
    if (!CLOCK.test(start) || !CLOCK.test(end))
        return { error: "Add a start and a finish time." };
    if (end <= start)
        return { error: "The finish has to be after the start, on the same day." };
    const note = words(s.note, exports.MAX_NOTE);
    return { shift: { ...person, day: s.day, start, end, ...(note ? { note } : {}) } };
}
/** A time off request as asked for, or what is wrong with it. `today` stops asks for days already gone. */
function cleanTimeOff(raw, today) {
    const s = (raw && typeof raw === "object" ? raw : {});
    const person = who(s);
    if (!EMAIL.test(person.email))
        return { error: "Sign in again to ask for time off." };
    if (!isDay(s.from))
        return { error: "Pick the first day off." };
    const to = isDay(s.to) ? s.to : s.from;
    if (to < s.from)
        return { error: "The last day can't be before the first." };
    if (s.from < today)
        return { error: "Pick days from today on." };
    if (daysBetween(s.from, to).length > exports.MAX_TIME_OFF_DAYS)
        return { error: `Ask for at most ${exports.MAX_TIME_OFF_DAYS} days at a time.` };
    const start = String(s.start || ""), end = String(s.end || "");
    const part = !!(start || end);
    if (part) {
        if (to !== s.from)
            return { error: "Part of a day is for one day only." };
        if (!CLOCK.test(start) || !CLOCK.test(end) || end <= start)
            return { error: "Add a start and a finish, the finish after the start." };
    }
    const note = words(s.note, exports.MAX_NOTE);
    return { ask: { ...person, from: s.from, to, ...(part ? { start, end } : {}), ...(note ? { note } : {}), status: "waiting" } };
}
/** Minutes in a planned shift. */
const rotaMinutes = (s) => {
    const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return Math.max(0, m(s.end) - m(s.start));
};
exports.rotaMinutes = rotaMinutes;
/** "Mon 24 Nov", "Mon 24 to Fri 28 Nov", "Mon 24 Nov, 2:00 PM to 4:00 PM": a request's days in plain words. */
function timeOffWhen(t) {
    const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = (day, month = true) => {
        const x = new Date(`${day}T12:00:00Z`);
        return `${WD[x.getUTCDay()]} ${x.getUTCDate()}${month ? ` ${MO[x.getUTCMonth()]}` : ""}`;
    };
    const clock = (hhmm) => {
        const h = Number(hhmm.slice(0, 2));
        return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
    };
    if (t.start && t.end)
        return `${d(t.from)}, ${clock(t.start)} to ${clock(t.end)}`;
    if (t.from === t.to)
        return d(t.from);
    return `${d(t.from, t.from.slice(0, 7) !== t.to.slice(0, 7))} to ${d(t.to)}`;
}
