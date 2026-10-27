// "This device is the shop owner's": the owner's own browsing never counts as shop traffic, even when they are not
// signed in (a phone, another browser, after signing out). Set automatically the first time the owner signs in to the
// admin on a browser, by Settings › General › Your own visits, or by opening any shop page with `?owner-device=on`
// (`off` undoes it). Kept in this browser only; it changes nothing but whether this browser's visits are counted.
// A pure module (no Firebase), shared by the storefront's tracking guard and the admin card.

/** The shop owner's sign-in (the one admin account, CLAUDE.md › Auth & admin access). */
export const SHOP_OWNER_EMAIL = "lyricalmyricalbooks@gmail.com";

/**
 * An order the owner placed themselves (with the shop's own email): kept in Orders, left out of the Overview's figures
 * and the Monday summary (functions/weeklySummary.js has the same rule). The browser flag below is for visits only: the
 * owner may ring up a real customer's order on their own computer, and that sale must count.
 */
export const isOwnOrder = (order: { customer?: { email?: unknown } } | null | undefined) =>
  String(order?.customer?.email || "").trim().toLowerCase() === SHOP_OWNER_EMAIL;

export const OWNER_DEVICE_KEY = "lm:owner-device";
export const OWNER_DEVICE_PARAM = "owner-device";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (): Store | null => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
};

/** "on" (left out of the numbers), "off" (the owner chose to count it) or "" (never decided). */
export function ownerDeviceChoice(storage: Store | null = store()): "on" | "off" | "" {
  try {
    const v = storage?.getItem(OWNER_DEVICE_KEY);
    return v === "on" || v === "off" ? v : "";
  } catch {
    return "";
  }
}

export const isOwnerDevice = (storage: Store | null = store()) => ownerDeviceChoice(storage) === "on";

export function setOwnerDevice(on: boolean, storage: Store | null = store()): void {
  try { storage?.setItem(OWNER_DEVICE_KEY, on ? "on" : "off"); } catch { /* storage blocked: nothing to remember */ }
}

/** The owner signed in to the admin here: leave this browser out, unless they chose to count it before. */
export function markOwnerDeviceOnSignIn(storage: Store | null = store()): void {
  if (ownerDeviceChoice(storage) === "") setOwnerDevice(true, storage);
}

/**
 * `?owner-device=on|off` on any page: remember the choice and take the parameter out of the address, so it is never
 * bookmarked, shared or sent to Google. Returns the cleaned address (or null when there was nothing to do).
 */
export function applyOwnerDeviceLink(href: string, storage: Store | null = store()): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const value = url.searchParams.get(OWNER_DEVICE_PARAM);
  if (value === null) return null;
  if (value === "on" || value === "off") setOwnerDevice(value === "on", storage);
  url.searchParams.delete(OWNER_DEVICE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Run once at start-up (main.tsx). */
export function takeOwnerDeviceLink(): void {
  if (typeof window === "undefined") return;
  const cleaned = applyOwnerDeviceLink(window.location.href);
  if (cleaned !== null) {
    try { window.history.replaceState(window.history.state, "", cleaned); } catch { /* address stays as typed */ }
  }
}

const BOT_AGENT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|phantomjs|puppeteer|playwright|chrome-lighthouse|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|embedly|preview/i;

/** Search-engine renderers, speed testers and automated browsers: they run the page's code but are not shoppers. */
export function looksAutomated(nav: { userAgent?: string; webdriver?: boolean } | null =
  typeof navigator !== "undefined" ? navigator : null): boolean {
  if (!nav) return false;
  if (nav.webdriver === true) return true;
  return BOT_AGENT.test(String(nav.userAgent || ""));
}
