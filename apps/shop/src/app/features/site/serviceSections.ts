// Pure rules for the website sections a services shop uses (Services plan phase 6, 17 November 2026): the price list,
// the team, the big Book button and hours & where to find us. They read the same `bookingInfo` answer as the Book a
// time page and section (`bookingInfoOnce`), so none of them asks the server for anything new.
import type { BookingInfo, BookingPerson, BookingServiceView } from "./bookTimeRules";

/** One opening window as the server keeps it ("09:00" to "17:00"). */
export type OpenWindow = { start: string; end: string };

/** Every service the shop takes bookings for, in the shop's own order (none while bookings are off). */
export const menuServices = (info: BookingInfo | null): BookingServiceView[] => (info?.on ? info.services || [] : []);

/** The people a client can book, each with the names of what they do ([] = every service). None when nobody is listed. */
export function teamRows(info: BookingInfo | null): Array<BookingPerson & { services: string[] }> {
  if (!info?.on) return [];
  const names = new Map((info.services || []).map((s) => [s.id, s.name]));
  return (info.staff || []).map((p) => ({
    ...p,
    services: p.serviceIds.map((id) => names.get(id)).filter((n): n is string => !!n),
  }));
}

/** The words of a person's button: "{name}" is replaced by their name; no placeholder adds nothing. */
export const personWords = (words: string, name: string) => words.split("{name}").join(name);

/** A clock time "09:00" in the visitor's way of writing times ("9:00 AM", "09:00"). */
export function clockText(hhmm: string, locale?: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return new Date(Date.UTC(2026, 0, 5, h, m)).toLocaleTimeString(locale, { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
}

export type HoursRow = { weekday: number; day: string; windows: string[]; today: boolean };

/**
 * The week's opening hours, Monday first. `hours` is the server's list, Sunday first (index = getUTCDay); a day with
 * no window is closed (`windows` empty). `today` (a "YYYY-MM-DD" shop day) marks its weekday.
 */
export function hoursRows(hours: OpenWindow[][] | undefined, today = "", locale?: string): HoursRow[] {
  if (!Array.isArray(hours) || hours.length !== 7) return [];
  const todayWeekday = /^\d{4}-\d{2}-\d{2}$/.test(today) ? new Date(`${today}T12:00:00Z`).getUTCDay() : -1;
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    // 4 January 2026 was a Sunday, so 4 + weekday is that weekday.
    day: new Date(Date.UTC(2026, 0, 4 + weekday, 12)).toLocaleDateString(locale, { timeZone: "UTC", weekday: "long" }),
    windows: (hours[weekday] || []).filter((w) => w?.start && w?.end).map((w) => `${clockText(w.start, locale)} – ${clockText(w.end, locale)}`),
    today: weekday === todayWeekday,
  }));
}

/** A link that opens the address in the visitor's maps (Google Maps works on every phone and computer). */
export const directionsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;

/** The Book a time page with someone already picked (`/book?with=<id>`). */
export const bookWithHref = (personId: string) => `/book?with=${encodeURIComponent(personId)}`;

/** The services a person does, for the Book a time page opened with them picked (every service when they do all). */
export function servicesFor(info: BookingInfo | null, personId: string): BookingServiceView[] {
  const all = menuServices(info);
  // A shop that books "anyone available" never narrows by person (plan 4, 2.4).
  const person = info?.staffPick === false ? undefined : (info?.staff || []).find((p) => p.id === personId);
  if (!person || !person.serviceIds.length) return all;
  return all.filter((s) => person.serviceIds.includes(s.id));
}
