// GENERATED from src/shared/timeClock.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Clock in and out (Bookings plan 4, 4.2, Beta): one shift is one stretch at work, with its breaks. The team desk
// clocks a person in and out (functions/bookings.js handleDesk op "clock"); the owner adds or fixes shifts in
// Bookings › Team pay. Shared by the admin and the server (a generated copy lives in functions/shared/).
Object.defineProperty(exports, "__esModule", { value: true });
exports.hourlyOf = exports.forgotten = exports.MAX_BREAKS = exports.MAX_SHIFT_HOURS = void 0;
exports.cleanShift = cleanShift;
exports.shiftMinutes = shiftMinutes;
exports.clockState = clockState;
exports.clockStep = clockStep;
exports.hoursText = hoursText;
/** A shift longer than this was almost surely a forgotten clock-out: the owner is asked to fix it. */
exports.MAX_SHIFT_HOURS = 16;
/** Breaks one shift can hold. */
exports.MAX_BREAKS = 6;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const time = (v) => (typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);
/**
 * A shift as typed or sent, made safe, or null with what is wrong. Breaks must sit inside the shift and not overlap;
 * a shift can't run past MAX_SHIFT_HOURS. An open shift (no out) can have one open break, the last.
 */
function cleanShift(raw) {
    const s = (raw && typeof raw === "object" ? raw : {});
    const email = String(s.email || "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 200)
        return { error: "Pick who worked this shift." };
    const name = String(s.name || "").trim().slice(0, 80) || email;
    const day = String(s.day || "");
    if (!DAY.test(day))
        return { error: "Pick the day." };
    const start = time(s.in);
    if (!start)
        return { error: "Add the time they started." };
    const end = s.out == null || s.out === "" ? null : time(s.out);
    if (s.out != null && s.out !== "" && !end)
        return { error: "That finish time doesn't look right." };
    const inMs = Date.parse(start);
    if (end && Date.parse(end) <= inMs)
        return { error: "The finish time has to be after the start." };
    if (end && Date.parse(end) - inMs > exports.MAX_SHIFT_HOURS * 3_600_000)
        return { error: `A shift can be at most ${exports.MAX_SHIFT_HOURS} hours.` };
    const list = Array.isArray(s.breaks) ? s.breaks : [];
    if (list.length > exports.MAX_BREAKS)
        return { error: `A shift can have at most ${exports.MAX_BREAKS} breaks.` };
    const breaks = [];
    let last = inMs;
    for (let i = 0; i < list.length; i++) {
        const b = (list[i] || {});
        const bs = time(b.start);
        const be = b.end == null || b.end === "" ? null : time(b.end);
        if (!bs || (b.end != null && b.end !== "" && !be))
            return { error: "A break time doesn't look right." };
        if (Date.parse(bs) < last)
            return { error: "Breaks have to be in order, inside the shift." };
        if (!be && (end || i !== list.length - 1))
            return { error: "Every break needs an end." };
        if (be && Date.parse(be) <= Date.parse(bs))
            return { error: "A break has to end after it starts." };
        if (be && end && Date.parse(be) > Date.parse(end))
            return { error: "Breaks have to be in order, inside the shift." };
        breaks.push({ start: bs, end: be });
        last = be ? Date.parse(be) : Date.parse(bs);
    }
    const staffId = typeof s.staffId === "string" && /^[\w-]{1,60}$/.test(s.staffId) ? s.staffId : "";
    const by = s.by === "self" ? "self" : "owner";
    return { shift: { email, name, ...(staffId ? { staffId } : {}), day, in: start, out: end, breaks, by } };
}
/** Minutes worked in a shift, breaks taken off; an open shift or break counts up to now. */
function shiftMinutes(shift, nowMs) {
    const inMs = Date.parse(shift.in);
    const outMs = shift.out ? Date.parse(shift.out) : nowMs;
    if (!Number.isFinite(inMs) || !(outMs > inMs))
        return 0;
    let off = 0;
    for (const b of shift.breaks || []) {
        const s = Math.max(inMs, Date.parse(b.start));
        const e = Math.min(outMs, b.end ? Date.parse(b.end) : nowMs);
        if (e > s)
            off += e - s;
    }
    return Math.max(0, Math.round((outMs - inMs - off) / 60_000));
}
function clockState(open) {
    if (!open || open.out)
        return { state: "off" };
    const last = open.breaks?.[open.breaks.length - 1];
    if (last && !last.end)
        return { state: "break", since: last.start, shiftIn: open.in };
    return { state: "working", since: last?.end || open.in, shiftIn: open.in };
}
function clockStep(open, step, nowIso, who) {
    const state = clockState(open);
    if (step === "in") {
        if (state.state !== "off")
            return { error: "You're already clocked in.", code: "already_in" };
        return { shift: { email: who.email, name: who.name, ...(who.staffId ? { staffId: who.staffId } : {}), day: who.day, in: nowIso, out: null, breaks: [], by: "self" } };
    }
    if (!open || state.state === "off")
        return { error: "You're not clocked in.", code: "not_in" };
    if (step === "break") {
        if (state.state === "break")
            return { error: "You're already on a break.", code: "on_break" };
        if (open.breaks.length >= exports.MAX_BREAKS)
            return { error: `A shift can have at most ${exports.MAX_BREAKS} breaks.`, code: "too_many" };
        return { shift: { ...open, breaks: [...open.breaks, { start: nowIso, end: null }] } };
    }
    if (step === "back") {
        if (state.state !== "break")
            return { error: "You're not on a break.", code: "not_on_break" };
        return { shift: { ...open, breaks: open.breaks.map((b, i) => (i === open.breaks.length - 1 ? { ...b, end: nowIso } : b)) } };
    }
    // Clocking out ends an open break too.
    return { shift: { ...open, out: nowIso, breaks: open.breaks.map((b) => (b.end ? b : { ...b, end: nowIso })) } };
}
/** True when an open shift has run so long it was surely a forgotten clock-out. */
const forgotten = (shift, nowMs) => !shift.out && nowMs - Date.parse(shift.in) > exports.MAX_SHIFT_HOURS * 3_600_000;
exports.forgotten = forgotten;
/** "7h 30m", "45m": minutes worked as people say them. */
function hoursText(minutes) {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`;
}
/** An hourly rate in cents as typed, or 0 for none. At most $1,000 an hour. */
const hourlyOf = (raw) => {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 0;
};
exports.hourlyOf = hourlyOf;
