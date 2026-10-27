import { ga4Event, ga4Items } from "./lib/ga4";
import { emitShopSignal } from "./lib/shopSignals";
import { useStudioOverlay } from "./features/site/studioOverlay";
import { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from "react";
import { preorderActive, releaseDateOf } from "./features/site/preorder";
import { comingSoonActive } from "./features/site/comingSoon";
import { clearBagNote } from "./features/site/bagNote";
import { addOnSelection, bundleComponents, giftCardDetails, isGiftCardProduct, saleActive, type GiftCardDetails } from "./features/site/promotions";
import { smallPhotoUrl } from "./features/site/photoSources";

/** A paid extra on one copy (signed copy, inscription, gift wrap). Price is per copy, CAD, from the catalog. */
export type CartAddOn = { id: string; label: string; price: number; text?: string };
export type CartGiftCardDetails = GiftCardDetails;
/** What the shopper chose for a line beyond the book and edition. Only ids/texts and the gift form are kept. */
export type CartLineOptions = { addOns?: { id: string; text?: string }[]; giftCardDetails?: Partial<GiftCardDetails> };

export interface CartItem {
  id: string;
  variantId?: string;
  variantName?: string;
  title: string;
  /** Per copy: catalog unit price + chosen add-ons (what the server charges). */
  price: number;
  quantity: number;
  photoUrl: string;
  stripePriceId?: string;
  stockLimit?: number;
  shippingProfileId?: string;
  /** Display only: the book was on pre-order when last checked (the server decides at checkout). */
  preorder?: boolean;
  releaseDate?: string;
  /** Extras picked for every copy on this line; the server re-prices them from the catalog. */
  addOns?: CartAddOn[];
  /** Gift-card products: who the card is emailed to (blank email = the buyer). */
  giftCardDetails?: CartGiftCardDetails;
  /** Display only: a gift-card product line. */
  giftCard?: boolean;
  /** Display only: a box set, and how many books one set holds. */
  bundle?: boolean;
  bundleCount?: number;
  /** Identity of the line (book + edition + add-ons + gift recipient). Derived; see cartLineKey. */
  lineKey?: string;
}

interface CartContextType {
  cart: CartItem[];
  /** false when nothing could be added (sold out, no usable price, or options the catalog refuses). */
  addToCart: (product: any, variant?: any, quantity?: number, options?: CartLineOptions) => boolean;
  /** Pass a line's `lineKey` (preferred), or the legacy (id, variantId) pair, which removes every matching line. */
  removeFromCart: (lineKeyOrId: string, variantId?: string) => void;
  /** `updateQuantity(lineKey, delta)`, or the legacy `updateQuantity(id, variantId, delta)`. */
  updateQuantity: (lineKeyOrId: string, variantIdOrDelta: string | undefined | number, delta?: number) => void;
  clearCart: () => void;
  setCart: (items: CartItem[]) => void;
  cartTotal: number;
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  /** The line just added while Studio › Cart drawer › After adding a book = small notice (else null). */
  lastAdded?: AddedLine | null;
  dismissAdded?: () => void;
  /** Set by the bag drawer from the design: "notice" shows the small notice instead of opening the bag. */
  setAddBehaviour?: (mode: AddBehaviour) => void;
}

export type AddBehaviour = "drawer" | "notice";
export type AddedLine = { item: CartItem; quantity: number; at: number };

/**
 * A line's identity: book, edition, add-ons (with their wording) and the gift-card recipient.
 * Lines with different inscriptions or recipients are separate lines. Plain lines are `id::variantId`.
 */
export function cartLineKey(line: { id: string; variantId?: string | null; addOns?: { id: string; text?: string }[]; giftCardDetails?: Partial<GiftCardDetails> }): string {
  const base = `${line.id}::${line.variantId || ""}`;
  const addOns = (line.addOns || []).map((a) => [a.id, a.text || ""]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const g = line.giftCardDetails;
  const gift = g ? [g.recipientName || "", g.recipientEmail || "", g.senderName || "", g.message || ""] : null;
  if (!addOns.length && !gift) return base;
  return `${base}::${JSON.stringify({ a: addOns, g: gift })}`;
}

const lineKeyOf = (line: CartItem) => line.lineKey || cartLineKey(line);
const sameEdition = (line: CartItem, id: string, variantId?: string) => line.id === id && (line.variantId || undefined) === (variantId || undefined);
const round2 = (n: number) => Math.round(n * 100) / 100;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Copies of the same book + edition already on other lines (they share its stock). */
function copiesElsewhere(cart: CartItem[], line: { id: string; variantId?: string }, key: string): number {
  return cart.filter((i) => sameEdition(i, line.id, line.variantId) && lineKeyOf(i) !== key).reduce((sum, i) => sum + i.quantity, 0);
}
/** The line's own stock cap after copies on its sibling lines (999 / undefined = untracked). */
function lineStock(stockLimit: number | undefined, elsewhere: number): number | undefined {
  return typeof stockLimit === "number" && stockLimit !== 999 ? Math.max(0, stockLimit - elsewhere) : stockLimit;
}
const bundleCountOf = (book: any) => bundleComponents(book).reduce((sum, part) => sum + part.quantity, 0);

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Pure quantity merge: existing line quantity + requested amount, clamped to
 * the stock limit (999 = untracked stock). Exported for tests.
 */
export function nextCartQuantity(existingQty: number, requested: number, stockLimit?: number): number {
  const req = Math.max(1, Math.floor(requested) || 1);
  const next = Math.min(MAX_LINE_QUANTITY, Math.max(0, existingQty) + req);
  return typeof stockLimit === "number" && stockLimit !== 999 ? Math.min(next, stockLimit) : next;
}

/** The server charges at most 99 copies per line (functions/index.js recalculateOrder). */
export const MAX_LINE_QUANTITY = 99;

/** How many copies a shopper may have of a line: stock when it is tracked, never above 99. */
export function lineQuantityCap(stockLimit?: number): number {
  return typeof stockLimit === "number" && stockLimit !== 999 ? Math.min(MAX_LINE_QUANTITY, Math.max(0, stockLimit)) : MAX_LINE_QUANTITY;
}

/**
 * Brings a bag saved earlier in line with the current catalog, the same way the server
 * prices it: current unit price, current stock cap, and books or editions that can no
 * longer be bought removed. `changed` lists what moved so checkout can tell the shopper.
 * Exported for tests.
 */
export function repriceCart(cart: CartItem[], books: any[]): { cart: CartItem[]; changed: boolean; removed: string[]; repriced: string[] } {
  const byId = new Map((books || []).map((b: any) => [b.id, b]));
  const out: CartItem[] = [];
  const removed: string[] = [];
  const repriced: string[] = [];
  let changed = false;
  const drop = (line: CartItem) => { removed.push(line.title || line.id); changed = true; };
  for (const line of cart) {
    const book = byId.get(line.id);
    const variant = line.variantId ? (book?.variants || []).find((v: any) => v.id === line.variantId) : undefined;
    const base = book ? catalogUnitPrice(book, variant) : NaN;
    if (!book || (line.variantId && !variant) || !Number.isFinite(base) || base < 0) { drop(line); continue; }
    const giftCard = isGiftCardProduct(book);
    if (giftCard && !(base > 0)) { drop(line); continue; }
    // Extras are re-priced from the catalog; a line whose extra was withdrawn can't be bought as is.
    let picked: { addOns: CartAddOn[]; price: number };
    let gift: CartGiftCardDetails | undefined;
    try {
      picked = addOnSelection(book, line.addOns);
      gift = giftCard ? giftCardDetails(line.giftCardDetails) : undefined;
    } catch {
      drop(line);
      continue;
    }
    const price = round2(base + picked.price);
    const tracked = !giftCard && book.trackInventory === true && book.allowBackorder !== true && !(variant?.allowBackorder);
    const stock = Number(variant ? (variant.stock ?? variant.stockLevel) : book.stockLevel);
    const stockLimit = tracked && Number.isFinite(stock) ? Math.max(0, stock) : 999;
    // A book switched back to Coming soon can't be bought until it is out (the server refuses it too).
    if (stockLimit === 0 || comingSoonActive(book)) { drop(line); continue; }
    const quantity = Math.min(line.quantity, lineQuantityCap(stockLimit));
    // Pre-order wording follows the live catalog: a book released since it was added loses it.
    const preorder = preorderActive(book);
    const releaseDate = preorder ? releaseDateOf(book) : "";
    if (!!line.preorder !== preorder || (line.releaseDate || "") !== releaseDate) changed = true;
    if (Math.abs(price - line.price) > 0.0001) repriced.push(line.title || line.id);
    if (Math.abs(price - line.price) > 0.0001 || quantity !== line.quantity || stockLimit !== line.stockLimit) changed = true;
    const addOns = picked.addOns.length ? picked.addOns : undefined;
    if (!sameJson(addOns, line.addOns?.length ? line.addOns : undefined) || !sameJson(gift, line.giftCardDetails)) changed = true;
    const bundleCount = bundleCountOf(book);
    if (!!line.giftCard !== giftCard || !!line.bundle !== bundleCount > 0 || (line.bundleCount || 0) !== bundleCount) changed = true;
    const next: CartItem = { ...line, price, quantity, stockLimit, preorder, releaseDate };
    delete next.addOns; delete next.giftCardDetails; delete next.giftCard; delete next.bundle; delete next.bundleCount;
    if (addOns) next.addOns = addOns;
    if (gift) { next.giftCardDetails = gift; next.giftCard = true; }
    if (bundleCount > 0) { next.bundle = true; next.bundleCount = bundleCount; }
    next.lineKey = cartLineKey(next);
    out.push(next);
  }
  return { cart: changed ? out : cart, changed, removed, repriced };
}

/**
 * Validates a cart restored from storage: drops anything that isn't a line with
 * an id, a finite non-negative price and a positive whole quantity, so a stale
 * or tampered `fm_cart` can never put NaN into totals. Exported for tests.
 */
export function sanitizeCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const line of raw) {
    if (!line || typeof line !== "object") continue;
    const i = line as any;
    const price = Number(i.price);
    const quantity = Math.floor(Number(i.quantity));
    if (typeof i.id !== "string" || !i.id) continue;
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 1) continue;
    const { addOns: rawAddOns, giftCardDetails: rawGift, lineKey: _key, ...rest } = i;
    const next: CartItem = { ...rest, price, quantity, title: String(i.title ?? ""), photoUrl: String(i.photoUrl ?? "") };
    // Extras: only well-formed ones survive (the server re-prices them anyway).
    if (Array.isArray(rawAddOns)) {
      const addOns = rawAddOns
        .filter((a: any) => a && typeof a.id === "string" && a.id && Number.isFinite(Number(a.price)) && Number(a.price) >= 0)
        .slice(0, 6)
        .map((a: any) => ({ id: a.id.slice(0, 60), label: String(a.label ?? "").slice(0, 80), price: Number(a.price), ...(typeof a.text === "string" && a.text ? { text: a.text.slice(0, 300) } : {}) }));
      if (addOns.length) next.addOns = addOns;
    }
    // A gift-card recipient that no longer validates would send the card to the wrong person: drop the line.
    if (rawGift !== undefined) {
      try { next.giftCardDetails = giftCardDetails(rawGift); } catch { continue; }
    }
    next.lineKey = cartLineKey(next);
    out.push(next);
  }
  return out;
}

/**
 * The unit price the server charges (functions/catalogPrice.js): a variant's own price,
 * else the sale price while the sale is on (promotions.saleActive), else the retail price.
 * NaN when the catalog has no usable price (the server refuses those too).
 * Exported for tests and for checkout cart recovery.
 */
export function catalogUnitPrice(book: any, variant?: any, now: Date = new Date()): number {
  if (variant) {
    const own = variant.price;
    return own === undefined || own === null || own === "" ? NaN : Number(own);
  }
  // Sale price only while the sale is on (positive price, inside its optional dates).
  return saleActive(book, now) ? Number(book.salePrice) : Number(book?.retailPrice);
}

/**
 * A tracked book the shop lets shoppers order past its stock (Books › edit › Inventory ›
 * Allow backorders). Book-level only, like the server's stock check (functions/index.js).
 */
export function backorderable(book: any, _variant?: any): boolean {
  return book?.trackInventory === true && book?.allowBackorder === true;
}

export const CART_KEY = "fm_cart";

function readStoredCart(): CartItem[] {
  try {
    const saved = localStorage.getItem(CART_KEY);
    return saved ? sanitizeCart(JSON.parse(saved)) : [];
  } catch {
    // Storage blocked (private mode) or corrupt JSON: start with an empty bag.
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Restored synchronously so the save effect below never writes an empty bag over the saved one.
  const [cart, setCart] = useState<CartItem[]>(readStoredCart);
  const [isCartOpen, setIsCartOpen] = useState(false);
  useStudioOverlay("cart", setIsCartOpen);
  // Studio › Style › Cart drawer › After adding a book (default: open the bag).
  const addBehaviour = useRef<AddBehaviour>("drawer");
  const [lastAdded, setLastAdded] = useState<AddedLine | null>(null);

  // Keep other open tabs in step (e.g. the bag emptied after a purchase in another tab).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CART_KEY) return;
      try { setCart(e.newValue ? sanitizeCart(JSON.parse(e.newValue)) : []); } catch { /* ignore corrupt value */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Save to local storage
  useEffect(() => {
    try {
      const next = JSON.stringify(cart);
      if (localStorage.getItem(CART_KEY) !== next) localStorage.setItem(CART_KEY, next);
    } catch {
      // Quota exceeded / storage unavailable: the in-memory cart still works.
    }
  }, [cart]);

  const addToCart = (product: any, variant?: any, quantity: number = 1, options?: CartLineOptions): boolean => {
    // Coming soon books are shown, never sold (Books › edit › Inventory › Coming soon).
    if (!product || comingSoonActive(product)) return false;
    const giftCard = isGiftCardProduct(product);
    // Gift cards have no stock; backorderable lines have no stock cap (same rule as repriceCart and the server).
    const stockLimit = giftCard || backorderable(product, variant) ? undefined : (variant ? (variant.stockLevel ?? variant.stock) : product.stockLevel);
    if (typeof stockLimit === "number" && stockLimit <= 0) return false;
    const base = catalogUnitPrice(product, variant);
    // A book with no usable price can't be charged; never put a NaN line in the bag.
    if (!Number.isFinite(base) || base < 0 || (giftCard && !(base > 0))) return false;
    let picked: { addOns: CartAddOn[]; price: number };
    let gift: CartGiftCardDetails | undefined;
    try {
      picked = addOnSelection(product, options?.addOns);
      gift = giftCard ? giftCardDetails(options?.giftCardDetails) : undefined;
    } catch {
      return false; // the product page validates first and shows Text & labels wording
    }
    const price = round2(base + picked.price);
    const bundleCount = bundleCountOf(product);
    const draft: CartItem = {
      id: product.id,
      variantId: variant?.id,
      variantName: variant?.name,
      title: product.title,
      price,
      quantity: 0,
      photoUrl: (variant && variant.photoUrl) ? variant.photoUrl : smallPhotoUrl(product.photos?.[0]),
      stripePriceId: variant?.stripePriceId || product.stripePriceId || "",
      stockLimit: typeof stockLimit === "number" ? stockLimit : undefined,
      shippingProfileId: product.shippingProfileId || "",
      preorder: preorderActive(product),
      releaseDate: preorderActive(product) ? releaseDateOf(product) : "",
      ...(picked.addOns.length ? { addOns: picked.addOns } : {}),
      ...(gift ? { giftCardDetails: gift, giftCard: true } : {}),
      ...(bundleCount > 0 ? { bundle: true, bundleCount } : {}),
    };
    const key = cartLineKey(draft);
    draft.lineKey = key;
    // Copies on sibling lines (same edition, other extras) share the stock.
    const cap = (list: CartItem[]) => lineQuantityCap(lineStock(draft.stockLimit, copiesElsewhere(list, draft, key)));
    // Already at the most this line can hold: nothing is added, so callers must not say "Added".
    const current = cart.find(i => lineKeyOf(i) === key);
    if ((current?.quantity || 0) >= cap(cart)) return false;

    setCart(prev => {
      const limit = lineStock(draft.stockLimit, copiesElsewhere(prev, draft, key));
      const existing = prev.find(i => lineKeyOf(i) === key);
      if (existing) {
        if (existing.quantity >= lineQuantityCap(limit)) return prev;
        return prev.map(i => i === existing ? { ...i, lineKey: key, quantity: nextCartQuantity(existing.quantity, quantity, limit) } : i);
      }
      if (lineQuantityCap(limit) <= 0) return prev;
      return [...prev, { ...draft, quantity: nextCartQuantity(0, quantity, limit) }];
    });
    // An open bag stays the place the shopper sees the change (e.g. its own suggestion card).
    if (addBehaviour.current === "notice" && !isCartOpen) setLastAdded({ item: { ...draft, quantity }, quantity, at: Date.now() });
    else setIsCartOpen(true);
    ga4Event("add_to_cart", { currency: "CAD", value: round2(price * quantity), items: ga4Items([{ ...draft, quantity }]) });
    emitShopSignal("bookAdd", product.id);
    return true;
  };

  const removeFromCart = (lineKeyOrId: string, variantId?: string) => {
    setCart(prev => {
      const byKey = variantId === undefined && prev.some(i => lineKeyOf(i) === lineKeyOrId);
      return prev.filter(i => (byKey ? lineKeyOf(i) !== lineKeyOrId : !sameEdition(i, lineKeyOrId, variantId)));
    });
  };

  const updateQuantity = (lineKeyOrId: string, variantIdOrDelta: string | undefined | number, maybeDelta?: number) => {
    const byKey = typeof variantIdOrDelta === "number";
    const delta = byKey ? (variantIdOrDelta as number) : Number(maybeDelta) || 0;
    setCart(prev => prev.map(i => {
      const match = byKey ? lineKeyOf(i) === lineKeyOrId : sameEdition(i, lineKeyOrId, variantIdOrDelta as string | undefined);
      if (!match) return i;
      const key = lineKeyOf(i);
      const cap = Math.max(1, lineQuantityCap(lineStock(i.stockLimit, copiesElsewhere(prev, i, key))));
      return { ...i, quantity: Math.min(Math.max(1, i.quantity + delta), cap) };
    }));
  };

  // A finished order also forgets the bag's order note (Style › Cart drawer › Order note box).
  const clearCart = () => { setCart([]); clearBagNote(); };

  // ⚡ Bolt: Cache derived calculations using `useMemo`
  // Measured impact: prevents O(N) recalculations on provider renders caused by unrelated state changes (like `isCartOpen`)
  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((acc, item) => acc + item.quantity, 0), [cart]);
  // Every line carries its key (lines set by checkout or older saved bags may not have one yet).
  const keyedCart = useMemo(() => (cart.every(i => i.lineKey === cartLineKey(i)) ? cart : cart.map(i => ({ ...i, lineKey: cartLineKey(i) }))), [cart]);

  return (
    <CartContext.Provider value={{ 
      cart: keyedCart, addToCart, removeFromCart, updateQuantity, clearCart, setCart,
      cartTotal, cartCount, isCartOpen, setIsCartOpen,
      lastAdded, dismissAdded: () => setLastAdded(null),
      setAddBehaviour: (mode: AddBehaviour) => { addBehaviour.current = mode; if (mode === "drawer") setLastAdded(null); },
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
