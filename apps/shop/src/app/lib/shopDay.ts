// The shop's calendar day (Toronto), shared by the admin Overview, the sales report and the Orders CSV.
// Pure, no admin imports, so the shopper bundle can use it too.

const DAY = 86_400_000;

/** The shop's own time zone: orders are counted on the Toronto calendar day they were placed. */
export const SHOP_TZ = "America/Toronto";
const shopFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Toronto calendar day ("2026-10-09") of a moment. */
export const shopDayKey = (t: number) => shopFmt.format(t);

/** A day key moved by whole days (pure date arithmetic, so daylight-saving changes never skip or repeat a day). */
export const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The Toronto day an order timestamp falls on ("" when unreadable). A bare date ("2026-09-29") is already a day.
 * Traffic is different: `analytics/<date>` docs stay on UTC days (firestore.rules fix their ids), so a daily
 * visitor count can differ from the orders of the same Toronto day by the few evening hours.
 */
export const orderDay = (v: unknown): string => {
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = new Date(s).getTime();
  if (!Number.isNaN(t) && s) return shopDayKey(t);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};
