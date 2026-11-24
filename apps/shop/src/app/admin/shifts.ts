// Hours worked in Team pay (Bookings plan 4, 4.2): the owner's list of shifts and the times typed in the shift dialog.
// Pure helpers; the dialog is ShiftsPanel.tsx and the server is functions/bookings.js ops shifts, saveShift, removeShift.
import { zonedTime, type StaffMember } from "../../shared/bookingTimes";
import type { Shift } from "../../shared/timeClock";
import { timeText } from "./bookingsView";

/** A shift as the server sends it to Team pay. */
export type ShiftRow = Shift & { id: string; minutes: number; forgotten: boolean };

/** "09:05" for a moment, on the shop's clock. */
export function clockTime(iso: string, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("hour")}:${get("minute")}`;
}

/**
 * A time typed for a shift ("17:30") as a moment: on the shift's day, or the next day when it falls before `after`
 * (a shift that runs past midnight). Empty for a blank or bad time.
 */
export function momentOn(day: string, hhmm: string, zone: string, after?: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
  let ms = zonedTime(day, hhmm, zone);
  if (after && ms < Date.parse(after)) ms += 86_400_000;
  return new Date(ms).toISOString();
}

/** The people a shift can be for: everyone on the team with a sign-in email, plus anyone who has clocked in. */
export function shiftPeople(staff: readonly StaffMember[], rows: readonly ShiftRow[]): { email: string; name: string; staffId: string }[] {
  const out = new Map<string, { email: string; name: string; staffId: string }>();
  for (const p of staff) if (p.email) out.set(p.email.toLowerCase(), { email: p.email.toLowerCase(), name: p.name, staffId: p.id });
  for (const r of rows) if (!out.has(r.email)) out.set(r.email, { email: r.email, name: r.name, staffId: r.staffId || "" });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "9:02 AM to 5:30 PM", or "9:02 AM, still on the clock". */
export function shiftSpan(r: Pick<Shift, "in" | "out">, zone: string): string {
  return r.out ? `${timeText(r.in, zone)} to ${timeText(r.out, zone)}` : `${timeText(r.in, zone)}, still on the clock`;
}

/** Minutes of break in a shift (finished breaks only). */
export const breakMinutes = (r: Pick<Shift, "breaks">) =>
  Math.round(r.breaks.reduce((n, b) => n + (b.end ? Date.parse(b.end) - Date.parse(b.start) : 0), 0) / 60_000);
