// Small shopper actions the Overview counts per book (Dig deeper › Titles / Stock): a book put in the bag, a book saved
// to the wishlist. The bag and the wishlist only announce them as a window event; main.tsx starts the one listener,
// which hands them to lib/commerce.ts (consent, owner device and preview checks live there). Keeping the bag and the
// wishlist free of the analytics code means their own tests and the Studio fixture never write counters.

const EVENT = "lm:shop-signal";
export type ShopSignal = { kind: "bookAdd" | "wishlistAdd"; bookId: string };

export function emitShopSignal(kind: ShopSignal["kind"], bookId: unknown): void {
  if (typeof window === "undefined" || !bookId) return;
  try { window.dispatchEvent(new CustomEvent<ShopSignal>(EVENT, { detail: { kind, bookId: String(bookId) } })); } catch { /* old browser: not counted */ }
}

let started = false;

/** Run once at start-up (main.tsx). */
export function listenShopSignals(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener(EVENT, (e: Event) => {
    const signal = (e as CustomEvent<ShopSignal>).detail;
    if (!signal?.bookId) return;
    void import("./commerce").then(({ funnelApi }) => (signal.kind === "bookAdd"
      ? funnelApi.trackBookAdd(signal.bookId)
      : funnelApi.trackWishlistAdd(signal.bookId))).catch(() => { /* best-effort */ });
  });
}
