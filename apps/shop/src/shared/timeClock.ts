// Clock in and out (Bookings plan 4, 4.2, Beta): one shift is one stretch at work, with its breaks. The team desk
// clocks a person in and out (functions/bookings.js handleDesk op "clock"); the owner adds or fixes shifts in
// Bookings › Team pay. Shared by the admin and the server (a generated copy lives in functions/shared/).

export type ShiftBreak = { start: string; end: string | null };
export type Shift = {
  id?: string;
  /** The person's sign-in email, lower case: who the shift belongs to. */
  email: string;
  name: string;
  /** Their entry under Team & rooms, when they have one (so Team pay can put hours next to their bookings). */
  staffId?: string;
  /** The shop day it started on (YYYY-MM-DD, the shop's time zone). */
  day: string;
  in: string;
  out: string | null;
  breaks: ShiftBreak[];
  /** "self" from the desk, "owner" when added or fixed in the admin. */
  by?: "self" | "owner";
};

/** A shift longer than this was almost surely a forgotten clock-out: the owner is asked to fix it. */
export const MAX_SHIFT_HOURS = 16;
/** Breaks one shift can hold. */
export const MAX_BREAKS = 6;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const time = (v: unknown): string | null => (typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

/**
 * A shift as typed or sent, made safe, or null with what is wrong. Breaks must sit inside the shift and not overlap;
 * a shift can't run past MAX_SHIFT_HOURS. An open shift (no out) can have one open break, the last.
 */
export function cleanShift(raw: unknown): { shift: Shift } | { error: string } {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const email = String(s.email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { error: "Pick who worked this shift." };
  const name = String(s.name || "").trim().slice(0, 80) || email;
  const day = String(s.day || "");
  if (!DAY.test(day)) return { error: "Pick the day." };
  const start = time(s.in);
  if (!start) return { error: "Add the time they started." };
  const end = s.out == null || s.out === "" ? null : time(s.out);
  if (s.out != null && s.out !== "" && !end) return { error: "That finish time doesn't look right." };
  const inMs = Date.parse(start);
  if (end && Date.parse(end) <= inMs) return { error: "The finish time has to be after the start." };
  if (end && Date.parse(end) - inMs > MAX_SHIFT_HOURS * 3_600_000) return { error: `A shift can be at most ${MAX_SHIFT_HOURS} hours.` };
  const list = Array.isArray(s.breaks) ? s.breaks : [];
  if (list.length > MAX_BREAKS) return { error: `A shift can have at most ${MAX_BREAKS} breaks.` };
  const breaks: ShiftBreak[] = [];
  let last = inMs;
  for (let i = 0; i < list.length; i++) {
    const b = (list[i] || {}) as Record<string, unknown>;
    const bs = time(b.start);
    const be = b.end == null || b.end === "" ? null : time(b.end);
    if (!bs || (b.end != null && b.end !== "" && !be)) return { error: "A break time doesn't look right." };
    if (Date.parse(bs) < last) return { error: "Breaks have to be in order, inside the shift." };
    if (!be && (end || i !== list.length - 1)) return { error: "Every break needs an end." };
    if (be && Date.parse(be) <= Date.parse(bs)) return { error: "A break has to end after it starts." };
    if (be && end && Date.parse(be) > Date.parse(end)) return { error: "Breaks have to be in order, inside the shift." };
    breaks.push({ start: bs, end: be });
    last = be ? Date.parse(be) : Date.parse(bs);
  }
  const staffId = typeof s.staffId === "string" && /^[\w-]{1,60}$/.test(s.staffId) ? s.staffId : "";
  const by = s.by === "self" ? "self" : "owner";
  return { shift: { email, name, ...(staffId ? { staffId } : {}), day, in: start, out: end, breaks, by } };
}

/** Minutes worked in a shift, breaks taken off; an open shift or break counts up to now. */
export function shiftMinutes(shift: Pick<Shift, "in" | "out" | "breaks">, nowMs: number): number {
  const inMs = Date.parse(shift.in);
  const outMs = shift.out ? Date.parse(shift.out) : nowMs;
  if (!Number.isFinite(inMs) || !(outMs > inMs)) return 0;
  let off = 0;
  for (const b of shift.breaks || []) {
    const s = Math.max(inMs, Date.parse(b.start));
    const e = Math.min(outMs, b.end ? Date.parse(b.end) : nowMs);
    if (e > s) off += e - s;
  }
  return Math.max(0, Math.round((outMs - inMs - off) / 60_000));
}

/** Where a person stands: off, working, or on a break (with since when). */
export type ClockState = { state: "off" } | { state: "working" | "break"; since: string; shiftIn: string };
export function clockState(open: Pick<Shift, "in" | "out" | "breaks"> | null | undefined): ClockState {
  if (!open || open.out) return { state: "off" };
  const last = open.breaks?.[open.breaks.length - 1];
  if (last && !last.end) return { state: "break", since: last.start, shiftIn: open.in };
  return { state: "working", since: last?.end || open.in, shiftIn: open.in };
}

/** The next step from the desk: what a press of each button does to an open shift (null shift = clocked out). */
export type ClockStep = "in" | "break" | "back" | "out";
export function clockStep(open: Shift | null, step: ClockStep, nowIso: string, who: Pick<Shift, "email" | "name" | "staffId" | "day">): { shift: Shift } | { error: string; code: string } {
  const state = clockState(open);
  if (step === "in") {
    if (state.state !== "off") return { error: "You're already clocked in.", code: "already_in" };
    return { shift: { email: who.email, name: who.name, ...(who.staffId ? { staffId: who.staffId } : {}), day: who.day, in: nowIso, out: null, breaks: [], by: "self" } };
  }
  if (!open || state.state === "off") return { error: "You're not clocked in.", code: "not_in" };
  if (step === "break") {
    if (state.state === "break") return { error: "You're already on a break.", code: "on_break" };
    if (open.breaks.length >= MAX_BREAKS) return { error: `A shift can have at most ${MAX_BREAKS} breaks.`, code: "too_many" };
    return { shift: { ...open, breaks: [...open.breaks, { start: nowIso, end: null }] } };
  }
  if (step === "back") {
    if (state.state !== "break") return { error: "You're not on a break.", code: "not_on_break" };
    return { shift: { ...open, breaks: open.breaks.map((b, i) => (i === open.breaks.length - 1 ? { ...b, end: nowIso } : b)) } };
  }
  // Clocking out ends an open break too.
  return { shift: { ...open, out: nowIso, breaks: open.breaks.map((b) => (b.end ? b : { ...b, end: nowIso })) } };
}

/** True when an open shift has run so long it was surely a forgotten clock-out. */
export const forgotten = (shift: Pick<Shift, "in" | "out">, nowMs: number) => !shift.out && nowMs - Date.parse(shift.in) > MAX_SHIFT_HOURS * 3_600_000;

/** "7h 30m", "45m": minutes worked as people say them. */
export function hoursText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`;
}

/** An hourly rate in cents as typed, or 0 for none. At most $1,000 an hour. */
export const hourlyOf = (raw: unknown): number => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 0;
};
