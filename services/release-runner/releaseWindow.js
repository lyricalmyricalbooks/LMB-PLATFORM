// When releases may go out (plan 13.6). Presses sell most at weekend fairs and in December, so a release does not start
// from Friday 15:00 until the end of Sunday, or from 11 to 25 December, unless it is marked as a security fix. The
// times are Montréal's, where the owner and most presses are. Pure: the date goes in, the answer comes out.
const ZONE = "America/Toronto";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The Montréal wall clock for a moment: { weekday: 0 (Sunday) to 6, month: 1 to 12, day, hour, minute }. */
export function montrealClock(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { weekday: WEEKDAYS.indexOf(parts.weekday), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** The reason a release should wait at this moment, or null when it may go out. */
export function closedBecause(date) {
  const { weekday, month, day, hour } = montrealClock(date);
  if (month === 12 && day >= 11 && day <= 25) return "the two weeks before Christmas, when presses sell the most";
  if (weekday === 6 || weekday === 0 || (weekday === 5 && hour >= 15)) return "the weekend (Friday 15:00 to Sunday night), when presses sell at fairs";
  return null;
}

/**
 * `{ open, reason, next }` for a moment. A security fix is always allowed. `next` is the next moment the window closes
 * or opens again, to the hour, as an ISO string (looked for up to 30 days ahead), so the control room can show it.
 */
export function releaseWindowAt(date = new Date(), { securityFix = false } = {}) {
  const reason = closedBecause(date);
  const open = securityFix || reason === null;
  const here = reason === null;
  let next = null;
  const step = 60 * 60 * 1000;
  for (let t = Math.floor(date.getTime() / step) * step + step, n = 0; n < 24 * 30; t += step, n += 1) {
    if ((closedBecause(new Date(t)) === null) !== here) { next = new Date(t).toISOString(); break; }
  }
  return { open, reason: open && !here ? "a security fix may go out anyway" : reason, next, closedNow: !here };
}
