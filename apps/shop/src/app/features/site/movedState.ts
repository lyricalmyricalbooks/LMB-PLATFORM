// After the move from GitHub Pages to Firebase Hosting, the old address forwards every visit here
// (scripts/pagesRedirect.mjs) and hands over what only it could read, in `#lm-move=<base64url JSON>`:
// the shopper's bag and wishlist (once per browser); on a payment return, that order's private access key and
// whether it was this tab's checkout attempt; and the referring site's host. Taken once at boot, before anything
// renders or measures, and removed from the address bar straight away.
// Anyone can craft such a link, so it can at most pre-fill an EMPTY bag with ordinary lines: prices are checked
// against the catalog again at checkout, and gift-card lines (which name who receives the code) are never taken.
import { CART_KEY, sanitizeCart } from "../../CartContext";
import { WISHLIST_KEY } from "../../lib/wishlist";
import { CHECKOUT_ATTEMPT_KEY, rememberOrderAccess } from "../../lib/orderAccessClient";
import { REFERRAL_KEY, referralSourceOf } from "../../lib/referralSource";
import { consentAllows } from "../../lib/consent";

export const MOVED_PREFIX = "#lm-move=";
const MAX_LENGTH = 16000;
const MAX_LINES = 50;
const MAX_WISHLIST = 200;

export type MovedState = { cart?: unknown[]; wishlist?: string[]; access?: { orderId: string; key: string; attempt?: boolean }; from?: string };

/** A gift-card line names who receives the code; the old address never sends one, so one arriving was crafted. */
const isGiftCardLine = (line: any) => !line || typeof line !== "object" || line.giftCard || line.giftCardDetails !== undefined;

export function decodeMovedState(hash: string): MovedState | null {
  if (!hash.startsWith(MOVED_PREFIX)) return null;
  const encoded = hash.slice(MOVED_PREFIX.length);
  if (!encoded || encoded.length > MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    if (!data || typeof data !== "object" || data.v !== 1) return null;
    const state: MovedState = {};
    if (Array.isArray(data.cart)) state.cart = data.cart.filter((line: unknown) => !isGiftCardLine(line)).slice(0, MAX_LINES);
    if (Array.isArray(data.wishlist)) state.wishlist = data.wishlist.filter((id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 200).slice(0, MAX_WISHLIST);
    const access = data.access;
    if (access && typeof access.orderId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(access.orderId) && typeof access.key === "string" && /^[a-f0-9]{64}$/.test(access.key)) {
      state.access = { orderId: access.orderId, key: access.key, ...(access.attempt === true ? { attempt: true } : {}) };
    }
    if (typeof data.from === "string" && /^[a-z0-9.-]{1,253}$/i.test(data.from)) state.from = data.from.toLowerCase();
    return state;
  } catch {
    return null;
  }
}

type Taken = { cart: number; wishlist: number; access: boolean; from?: string };

export function takeMovedState(win: Window | undefined = typeof window === "undefined" ? undefined : window): Taken | null {
  if (!win || !win.location.hash.startsWith(MOVED_PREFIX)) return null;
  const url = new URL(win.location.href);
  try { win.history.replaceState(win.history.state, "", `${url.pathname}${url.search}`); } catch { /* keep the address */ }
  const state = decodeMovedState(url.hash);
  if (!state) return null;
  const taken: Taken = { cart: 0, wishlist: 0, access: false };
  try {
    const local = win.localStorage;
    // Only into an empty bag: never mix with or replace what the shopper already has here.
    const current = sanitizeCart(JSON.parse(local.getItem(CART_KEY) || "[]"));
    const incoming = sanitizeCart(state.cart || []);
    if (!current.length && incoming.length) { local.setItem(CART_KEY, JSON.stringify(incoming)); taken.cart = incoming.length; }
    if (state.wishlist?.length) {
      const saved = JSON.parse(local.getItem(WISHLIST_KEY) || "[]");
      const mine = Array.isArray(saved) ? saved.filter((id: unknown): id is string => typeof id === "string") : [];
      const merged = [...new Set([...mine, ...state.wishlist])].slice(0, MAX_WISHLIST);
      if (merged.length !== mine.length) { local.setItem(WISHLIST_KEY, JSON.stringify(merged)); taken.wishlist = merged.length - mine.length; }
    }
  } catch { /* storage blocked: nothing carried over */ }
  // The access key opens only the order this payment return is about. If it was this tab's checkout attempt, a retry
  // here is still sent as one, so the server can refuse to charge again for an order that is already paid.
  if (state.access && url.searchParams.get("order_id") === state.access.orderId) {
    rememberOrderAccess(state.access.orderId, state.access.key);
    if (state.access.attempt) {
      try { win.sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, state.access.orderId); } catch { /* storage blocked */ }
    }
    taken.access = true;
  }
  // Where the visit came from, which the forwarding page couldn't pass on as a referrer (same rules as App.tsx).
  if (state.from) {
    try {
      const source = referralSourceOf(`https://${state.from}/`, url.hostname);
      if (source && consentAllows("analytics") && !win.sessionStorage.getItem(REFERRAL_KEY)) {
        win.sessionStorage.setItem(REFERRAL_KEY, source);
        taken.from = source;
      }
    } catch { /* storage blocked */ }
  }
  return taken;
}
