// Shared discount links (Admin › Discounts › Copy share link): `<site>/?discount=CODE` on any page.
// The code is remembered for this tab and removed from the address bar; checkout fills it into the
// discount box and checks it with the server like a typed code (the server stays authoritative).
const KEY = "lm_shared_discount";
const VALID = /^[A-Z0-9_-]{3,32}$/;

export function captureSharedDiscount(win: Window | undefined = typeof window === "undefined" ? undefined : window): string {
  if (!win) return "";
  try {
    const url = new URL(win.location.href);
    const raw = url.searchParams.get("discount");
    if (raw === null) return "";
    url.searchParams.delete("discount");
    try { win.history.replaceState(win.history.state, "", `${url.pathname}${url.search}${url.hash}`); } catch { /* keep the address */ }
    const code = raw.trim().toUpperCase();
    if (!VALID.test(code)) return "";
    try { win.sessionStorage.setItem(KEY, code); } catch { /* storage blocked: the link simply doesn't carry over */ }
    return code;
  } catch {
    return "";
  }
}

/** The remembered code, if any (not cleared: call clearSharedDiscount once checkout has tried it). */
export function sharedDiscount(storage: Storage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage): string {
  try {
    const code = String(storage?.getItem(KEY) || "");
    return VALID.test(code) ? code : "";
  } catch {
    return "";
  }
}

/**
 * A code the shopper typed into the bag's discount box (Style › Cart drawer › Discount code box).
 * Kept in the same place as a shared link's code, so checkout fills and checks it the same way.
 * Returns the saved code, or "" when it can't be a discount code (nothing is saved then).
 */
export function rememberDiscountCode(raw: string, storage: Storage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage): string {
  const code = String(raw || "").trim().toUpperCase();
  if (!VALID.test(code)) return "";
  try { storage?.setItem(KEY, code); } catch { return ""; }
  return code;
}

export function clearSharedDiscount(storage: Storage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage) {
  try { storage?.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** The link the admin shares: the shop's home page (sub-path aware) with ?discount=CODE. */
export function discountShareLink(code: string, origin: string, base = "/"): string {
  const path = `/${String(base || "/").replace(/^\/+|\/+$/g, "")}/`.replace(/\/{2,}/g, "/");
  return `${origin.replace(/\/+$/, "")}${path}?discount=${encodeURIComponent(String(code || "").trim().toUpperCase())}`;
}
