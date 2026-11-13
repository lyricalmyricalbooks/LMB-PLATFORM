// The shop's own time zone (13 November 2026, tasks/todo/2026-11-13-us-shops.md): the clock its day, its sale dates,
// its release dates and its daily numbers follow. One copy for the pages and the server (src/shared/CLAUDE.md).
//
// Where it comes from: the pages read the shop profile's `timeZone` (public/shop-profile.js, set before the app starts);
// the server says where to look once, with setShopTimeZoneSource (functions/shopConfig.js: the shop's record, read when
// the code runs, because one server runs every shop). Missing or unreadable: Eastern time, as every shop was before.

export const DEFAULT_SHOP_TIME_ZONE = "America/Toronto";

const known = new Map<string, boolean>();
/** True for a zone name this machine's calendar knows ("America/Vancouver"). */
function realZone(name: string): boolean {
  let ok = known.get(name);
  if (ok === undefined) {
    try { new Intl.DateTimeFormat("en-CA", { timeZone: name }); ok = true; } catch { ok = false; }
    known.set(name, ok);
  }
  return ok;
}

/** A zone name as the shop uses it: the name itself when it is a real "Area/Place" zone, Eastern time otherwise. */
export function shopTimeZoneOf(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(name) && name.length <= 64 && realZone(name) ? name : DEFAULT_SHOP_TIME_ZONE;
}

const fromPage = (): unknown => {
  const g = globalThis as any;
  return (g.window?.__SHOP_PROFILE__ ?? g.__SHOP_PROFILE__)?.timeZone;
};
let source: () => unknown = fromPage;

/** The server's one line: where this shop's zone is read from. Call with nothing to go back to the page's profile. */
export function setShopTimeZoneSource(read?: () => unknown): void {
  source = read ?? fromPage;
}

/** The time zone of the shop this code is running for. */
export function shopTimeZone(): string {
  try { return shopTimeZoneOf(source()); } catch { return DEFAULT_SHOP_TIME_ZONE; }
}

/** The shop's calendar day of a moment, "2026-11-13". */
export function shopCalendarDay(at: Date | number = new Date(), zone: string = shopTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
