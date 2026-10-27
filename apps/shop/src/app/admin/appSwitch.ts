import { useSyncExternalStore } from "react";
import { orderDay } from "../lib/shopDay";

// The "Website · Inventory" switcher: the website admin and the inventory app (lyricalmyricalbooks/lyrical-inventory)
// open each other. Rules shared with the inventory app's src/lib/app-switch.js (docs/INVENTORY_LINK.md › Switching
// between the apps). Pure helpers first; the window handling takes its window as an argument so it can be tested.

export const INVENTORY_APP_URL = "https://lyricalmyricalbooks.github.io/lyrical-inventory/";
/** Each app names its own tab so the other can find it again instead of opening another one. */
export const WEBSITE_TAB_NAME = "lm-website-admin";
export const INVENTORY_TAB_NAME = "lm-inventory-app";

/** The inventory app opened on a website order's sales (only the #fragment differs, so an open app doesn't reload). */
export const inventoryOrderUrl = (orderId: string) => `${INVENTORY_APP_URL}#website-order=${encodeURIComponent(orderId)}`;

/** The inventory app opened on one of its books, or on its search with this text (docs/INVENTORY_LINK.md › One search box). */
export const inventoryBookUrl = (inventoryBookId: string) => `${INVENTORY_APP_URL}#book=${encodeURIComponent(inventoryBookId)}`;
export const inventorySearchUrl = (text: string) => `${INVENTORY_APP_URL}#search=${encodeURIComponent(String(text).trim().slice(0, 100))}`;

export interface AppBookEntry { id: string; title: string; author: string; isbn: string }
/** The app's books matching what was typed (title, author or ISBN; ISBN ignores spaces and hyphens). */
export function matchAppBooks(books: AppBookEntry[] | null | undefined, term: string, max = 4): AppBookEntry[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const bare = t.replace(/[\s-]/g, "");
  return (books || []).filter((b) => b && (
    String(b.title || "").toLowerCase().includes(t) || String(b.author || "").toLowerCase().includes(t)
    || (bare.length >= 4 && String(b.isbn || "").replace(/[\s-]/g, "").toLowerCase().includes(bare))
  )).slice(0, max);
}

/** Website orders waiting for the inventory app, or null when the link isn't connected (no badge, never a made-up 0). */
export function inventoryWaiting(state: any): number | null {
  if (state?.connection?.ok !== true) return null;
  const n = Number(state?.pendingImport?.count);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export type InventoryLinkView = { waiting: number; startDay: string };
/** What the switcher and order pages need from the link's saved state (null = not connected). */
export function inventoryLinkView(state: any): InventoryLinkView | null {
  const waiting = inventoryWaiting(state);
  if (waiting === null) return null;
  return { waiting, startDay: typeof state?.startDay === "string" ? state.startDay : "" };
}

// Same statuses as functions/inventoryLink.js COUNTED_STATUSES.
const COUNTED = new Set(["paid", "refund_pending", "refunded"]);
/**
 * Whether the website sent this order to the inventory app: the server's own rule (`countsForInventory` in
 * functions/inventoryLink.js) — a real order, accepted payment, paid on or after the day sales started being sent.
 */
export function orderInInventoryApp(order: any, startDay: string): boolean {
  if (!order || order.isTest === true || !startDay) return false;
  if (!COUNTED.has(String(order.paymentStatus || ""))) return false;
  const day = typeof order.paidAt === "string" ? orderDay(order.paidAt) : "";
  return !!day && day >= startDay;
}

type Win = {
  open: (url?: string, target?: string) => any;
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: any;
  document?: { referrer?: string };
};

/** An installed app (home screen, Android app, Chrome "Install app"): links go to the phone, not window.open. */
export function isInstalledApp(win: Win): boolean {
  try {
    if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (win.navigator?.standalone === true) return true;
    return String(win.document?.referrer || "").startsWith("android-app://");
  } catch { return false; }
}

let openedTab: any = null;
/** Tests start each case from a page that has opened nothing. */
export function forgetOpenedTab() { openedTab = null; }

/**
 * Opens the inventory app from a click. Returns true when it handled the click (call preventDefault), false to let
 * the plain link open it (installed apps, a blocked pop-up).
 *
 * Browsers only bring a tab forward for the page that opened it, or through window.open with the tab's name, so a
 * page never calls `opener.focus()` (a silent no-op in Chrome). The inventory app names its own tab, so the named
 * open below also finds the tab that opened this one. The opener is kept on purpose: it keeps both tabs in the same
 * browser group, which is where the name lookup searches.
 */
export function openInventoryApp(win: Win, url: string = INVENTORY_APP_URL, deep = url !== INVENTORY_APP_URL): boolean {
  if (isInstalledApp(win)) return false;
  try {
    // A tab this page opened before: this page may move and raise it directly.
    if (openedTab && !openedTab.closed) {
      if (deep) openedTab.location.href = url; // only the #fragment changes, so the app keeps running
      openedTab.focus?.();
      return true;
    }
    // The tab named for the inventory app (opened by us, or the one that opened us), else a new one.
    const tab = win.open("", INVENTORY_TAB_NAME);
    if (!tab) return false;
    let blank = false;
    try { blank = tab.location.href === "about:blank"; } catch { /* the inventory app is already open there */ }
    if (blank) tab.location.replace(url);
    else if (deep) tab.location.href = url;
    tab.focus?.();
    openedTab = tab;
    return true;
  } catch { return false; }
}

/* The link's state, shared by the rail, the phone top bar and order pages (Dashboard reads it with the alerts). */
let link: InventoryLinkView | null = null;
const listeners = new Set<() => void>();
export function setInventoryLink(next: InventoryLinkView | null) {
  if (next === link || (next && link && next.waiting === link.waiting && next.startDay === link.startDay)) return;
  link = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** null = the inventory app link isn't connected; otherwise the waiting count and the day sales started being sent. */
export const useInventoryLink = () => useSyncExternalStore(subscribe, () => link, () => link);
/** How many website orders wait for the inventory app (null = not connected). */
export const useInventoryWaiting = () => useInventoryLink()?.waiting ?? null;
