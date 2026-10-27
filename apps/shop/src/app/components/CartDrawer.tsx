import { layerDesign } from "../features/site/designModel";
import { CartShippingPreview } from "./CartShippingPreview";
import { CartDiscountCode } from "./CartDiscountCode";
import { bagSavings } from "../features/site/bagSavings";
import { CartOrderNote } from "./CartOrderNote";
import { CartTermsAgree } from "./CartTermsAgree";
import { CartShipBy } from "./CartShipBy";
import { bagShipsOnSchedule, cartShipByOn } from "../features/site/bagShipBy";
import { rememberTermsAgreed, termsAgreed } from "../features/site/bagTerms";
import { useEffect, useMemo, useRef, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { Link, useLocation, useNavigate } from "react-router";
import toast from "react-hot-toast";
import { useCart, catalogUnitPrice, MAX_LINE_QUANTITY, repriceCart } from "../CartContext";
import { quickAddChoice } from "../features/site/buyable";
import { dailyBagSuggestion } from "../features/site/bagSuggestion";
import { isLiveBook } from "../features/site/liveBook";
import { useSiteData } from "../features/site/useSiteData";
import { getCopy } from "../features/site/storeCopy";
import { linePreorderNote } from "../features/site/preorder";
import { useCurrency } from "../CurrencyContext";
import { StorefrontThemeStyle } from "../features/site/StorefrontThemeStyle";
import { cartDrawerCss, cartDrawerFontNames, cartDrawerWidth } from "../features/site/cartDrawerStyle";
import { googleFontHref } from "../features/site/fonts";
import { useFocusTrap } from "../lib/useFocusTrap";
import { catalogFulfillmentItems } from "../features/site/checkoutFulfillment";
import { bagFreeShipThreshold, shippableBagTotal } from "../features/site/freeShipThreshold";

import { loadShippingProfiles } from "../features/site/shippingProfilesLoad";
import { X, ShoppingBag, Minus, Plus as PlusIcon, Trash2, ArrowRight, ShieldCheck, Truck, Lock } from "lucide-react";
import { smallPhotoUrl } from "../features/site/photoSources";
import { previewSampleCart } from "../features/site/previewSampleCart";
import { inEditorPreview } from "../lib/trackingGuard";
import { ga4ViewCart } from "../lib/ga4";
import { AddedToBagNotice } from "../features/site/AddedToBagNotice";
import { addedNoticeOn } from "../features/site/addedNotice";
import { useWishlist } from "../lib/wishlist";
import { canSaveForLater, saveForLaterOn } from "../features/site/saveForLater";
import { emptyBagPicks, emptyBagPicksCount, emptyBagPicksOn } from "../features/site/emptyBagPicks";
import { bookSlug } from "../features/site/staffNotes";
import { tabReminderApplies, tabReminderOn, tabReminderTitle, titleToRestore } from "../features/site/extras/cart-tab-reminder/tabReminder";

// The shopping bag. Its look is the Studio › Style › "Cart drawer (shopping bag)" group (CSS from
// features/site/cartDrawerStyle.ts); its words are Studio › Text & labels › Cart.
/** Lets a long joined-up title (SISTEMA_NON_AUTORIZZATO) break after its underscores before anywhere else. */
function breakableTitle(title: unknown) {
  const parts = String(title ?? "").split(/(?<=_)/);
  return parts.map((part, i) => <span key={i}>{part}{i < parts.length - 1 && <wbr />}</span>);
}

export function CartDrawer() {
  const shopper = useCart();
  const { isCartOpen, setIsCartOpen } = shopper;
  const [shippingEstimate, setShippingEstimate] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { books, settings, fresh } = useSiteData();
  // Studio preview only: an empty bag borrows one display-only line (like checkout), so the bag's
  // line, total and suggestion controls can be seen while editing them. Removing it shows the empty
  // bag. Nothing is ever written to the shopper's bag: every change below is a no-op for the sample.
  const [sampleRemoved, setSampleRemoved] = useState(false);
  const sample = useMemo(() => (inEditorPreview() && shopper.cart.length === 0 && !sampleRemoved
    ? previewSampleCart(books?.length ? books : (window as any).__studioPreviewState?.books || []) : []), [shopper.cart.length, books, sampleRemoved]);
  const isSample = sample.length > 0;
  const cart = isSample ? sample : shopper.cart;
  const cartTotal = isSample ? sample.reduce((n, i) => n + i.price * i.quantity, 0) : shopper.cartTotal;
  const setCart: typeof shopper.setCart = (next) => { if (!isSample) shopper.setCart(next); };
  const updateQuantity: typeof shopper.updateQuantity = (...args) => { if (!isSample) shopper.updateQuantity(...args); };
  const removeFromCart: typeof shopper.removeFromCart = (...args) => { if (isSample) setSampleRemoved(true); else shopper.removeFromCart(...args); };
  const addToCart: typeof shopper.addToCart = ((...args: Parameters<typeof shopper.addToCart>) => (isSample ? false : shopper.addToCart(...args))) as typeof shopper.addToCart;
  // A bag saved earlier shows today's prices and stock caps once the live catalog has loaded,
  // so its subtotal matches checkout. Lines that can no longer be bought are left for checkout,
  // which removes them and tells the shopper why. Never in a Studio preview (draft catalog).
  useEffect(() => {
    if (!fresh || !books?.length || !cart.length) return;
    if (new URLSearchParams(window.location.search).get("preview") === "true") return;
    const next = repriceCart(cart, books);
    if (next.changed && next.removed.length === 0) setCart(next.cart);
  }, [fresh, books, cart]);
  const { formatPrice } = useCurrency();
  // Remove acts at once; the toast's Undo puts the same line (quantity, extras, gift details) back where it was.
  const cartRef = useRef(cart);
  cartRef.current = cart;
  // Google Analytics view_cart each time the bag opens, with the shopper's own lines (never the preview sample).
  const shopperCartRef = useRef(shopper.cart);
  shopperCartRef.current = shopper.cart;
  useEffect(() => { if (isCartOpen) ga4ViewCart(shopperCartRef.current); }, [isCartOpen]);
  const removeWithUndo = (key: string, item: (typeof cart)[number], index: number) => {
    removeFromCart(key);
    if (isSample) return;
    const lineKeyOf = (line: (typeof cart)[number]) => line.lineKey || `${line.id}::${line.variantId || ""}`;
    toast((t) => (
      <span className="flex items-center gap-3">
        <span>{getCopy(design, "cartRemoved", { title: item.title })}</span>
        <button
          type="button"
          className="font-black underline min-h-[32px] px-1"
          onClick={() => {
            toast.dismiss(t.id);
            const now = cartRef.current;
            // Already back in the bag (added again meanwhile): leave it as it is.
            if (now.some((line) => lineKeyOf(line) === key)) return;
            const next = [...now];
            next.splice(Math.min(index, next.length), 0, item);
            setCart(next);
          }}
        >
          {getCopy(design, "cartRemovedUndo")}
        </button>
      </span>
    ), { id: `cart-removed-${key}`, duration: 6000 });
  };
  // Save for later: the line leaves the bag and its book joins the wishlist. Undo puts the line back
  // and takes the book off the wishlist again only if this button put it there.
  const wishlist = useWishlist();
  const saveForLater = (key: string, item: (typeof cart)[number], index: number) => {
    if (isSample) return;
    const wasSaved = wishlist.has(item.id);
    removeFromCart(key);
    if (!wasSaved) wishlist.toggle(item.id);
    const lineKeyOf = (line: (typeof cart)[number]) => line.lineKey || `${line.id}::${line.variantId || ""}`;
    toast((t) => (
      <span className="flex items-center gap-3">
        <span>{getCopy(design, "cartSavedLater", { title: item.title })}</span>
        <button
          type="button"
          className="font-black underline min-h-[32px] px-1"
          onClick={() => {
            toast.dismiss(t.id);
            if (!wasSaved) wishlist.remove(item.id);
            const now = cartRef.current;
            if (now.some((line) => lineKeyOf(line) === key)) return;
            const next = [...now];
            next.splice(Math.min(index, next.length), 0, item);
            setCart(next);
          }}
        >
          {getCopy(design, "cartRemovedUndo")}
        </button>
      </span>
    ), { id: `cart-saved-${key}`, duration: 6000 });
  };
  const drawerRef = useRef<HTMLDivElement>(null);
  // Dialog behaviour: focus moves in, Tab is contained, Escape closes, focus returns to the opener.
  useFocusTrap(drawerRef, isCartOpen, () => setIsCartOpen(false));

  // ⚡ Bolt: Cache books by ID for O(1) lookups during cart iteration
  const booksMap = useMemo(() => new Map((books || []).map(b => [b.id, b])), [books]);

  // "Complete your collection": a published book not in the bag, same category when possible.
  const cartIds = new Set(cart.map((i) => i.id));
  // Only books that can actually be added right now (in stock, with a usable price).
  const candidateBooks = (books || []).filter((b) => {
    if (cartIds.has(b.id) || b.status !== "published" || !isLiveBook(b)) return false;
    const choice = quickAddChoice(b);
    return choice.inStock && Number.isFinite(catalogUnitPrice(b, choice.variant));
  });
  const recommendedChoice = (book: any) => quickAddChoice(book).variant;
  const cartCategories = new Set(cart.flatMap((i) => booksMap.get(i.id)?.categories || []));
  // A different book each Toronto day (the same one for every shopper that day), same category when possible.
  const recommendedBook = dailyBagSuggestion(candidateBooks, cartCategories);

  // Resolve storefront design settings (flat or nested under `.storefront`).
  const rawDesign = (settings as any)?.design || {};
  // Same resolution as MainSite's catalog design (designModel.layerDesign).
  const design = layerDesign(rawDesign, rawDesign.storefront);
  const showFreeShipBar = design.showFreeShipBar ?? true;
  // Style › Cart drawer › each badge has its own switch; the row hides when none is left.
  const trustBadges = [
    { key: "secure", show: design.cartDrawerShowSecureBadge ?? true, Icon: Lock, copy: "trustSecureLabel" as const },
    { key: "tracked", show: design.cartDrawerShowTrackedBadge ?? true, Icon: Truck, copy: "trustTrackedLabel" as const },
    { key: "returns", show: design.cartDrawerShowReturnsBadge ?? true, Icon: ShieldCheck, copy: "trustReturnsLabel" as const },
  ].filter((badge) => badge.show);
  const showTrustBadges = (design.showCartTrustBadges ?? true) && trustBadges.length > 0;
  const showCount = design.cartDrawerShowCount ?? true;
  const showNumbers = design.cartDrawerShowItemNumbers ?? true;
  const showUnitPrice = design.cartDrawerShowUnitPrice ?? true;
  const showPreorder = design.cartDrawerShowPreorder ?? true;
  // Extras (signed copy, inscription), gift-card recipient and box-set contents under each line.
  const showLineOptions = design.cartDrawerShowLineOptions ?? true;
  const showLineTotal = design.cartDrawerShowLineTotal ?? true;
  const showUpsell = design.cartDrawerShowUpsell ?? true;
  const showSummary = design.cartDrawerShowSummary ?? true;
  const showDeliveryNote = design.cartDrawerShowDeliveryNote ?? true;
  const showArrow = design.cartDrawerShowCheckoutArrow ?? true;
  const backdropBlur = design.cartDrawerBackdropBlur ?? true;
  const qtyStyle = design.cartDrawerQtyStyle === "pill" ? "pill" : "boxes";
  const removeAsIcon = design.cartDrawerRemoveStyle === "icon";
  const showSaveForLater = saveForLaterOn(design);
  // Style › Cart drawer › Book rows › Sale savings (off by default): display only, the server prices the order.
  const showSavings = design.cartDrawerShowSavings === true;
  const savings = useMemo(() => (showSavings ? bagSavings(cart, booksMap) : null), [showSavings, cart, booksMap]);
  // Style › Cart drawer › Total & checkout button › Ships-by line (off by default): only when every printed book can leave on schedule.
  const showShipBy = cartShipByOn(design) && bagShipsOnSchedule(cart, booksMap);
  const fromLeft = design.cartDrawerSide === "left";
  const grayscaleThumbs = design.cartDrawerGrayscaleThumbs ?? false;
  const showThumbs = design.cartDrawerShowThumbs ?? true;
  // Style › Cart drawer › Empty bag: the icon, the button and where the button goes.
  const showEmptyIcon = design.cartDrawerShowEmptyIcon ?? true;
  const showEmptyButton = design.cartDrawerShowEmptyButton ?? true;
  const emptyLink = typeof design.cartDrawerEmptyLink === "string" ? design.cartDrawerEmptyLink.trim() : "";
  const continueShopping = () => {
    setIsCartOpen(false);
    if (/^https?:\/\//i.test(emptyLink)) { window.location.assign(emptyLink); return; }
    navigate(emptyLink.startsWith("/") ? emptyLink : "/");
  };
  // Style › Cart drawer › Empty bag › Suggest books in an empty bag (off by default).
  const emptyPicks = cart.length === 0 && emptyBagPicksOn(design) ? emptyBagPicks(candidateBooks, emptyBagPicksCount(design)) : [];
  const itemCount = cart.reduce((n, i) => n + (i.quantity || 0), 0);

  // The bar follows Settings › Shipping's own free-shipping rules, so it never promises
  // something checkout won't charge. No rule (or an e-book-only bag) → no bar.
  const [shippingProfiles, setShippingProfiles] = useState<any[] | null>(null);
  useEffect(() => {
    if (!isCartOpen || shippingProfiles) return;
    let live = true;
    loadShippingProfiles().then((profiles) => { if (live) setShippingProfiles(profiles); });
    return () => { live = false; };
  }, [isCartOpen, shippingProfiles]);
  const fulfillmentItems = useMemo(() => catalogFulfillmentItems(cart, booksMap), [cart, booksMap]);
  const hasPhysicalItems = fulfillmentItems ? fulfillmentItems.some((item) => item.physical) : cart.length > 0;
  const FREE_SHIP_THRESHOLD = bagFreeShipThreshold(shippingProfiles, hasPhysicalItems);
  // Only printed books count: checkout charges shipping on physical lines, so e-books and gift cards can't fill the bar.
  const shippableTotal = shippableBagTotal(fulfillmentItems, cartTotal);
  const remaining = FREE_SHIP_THRESHOLD ? Math.max(0, FREE_SHIP_THRESHOLD - shippableTotal) : 0;
  const progress = FREE_SHIP_THRESHOLD ? Math.min(100, (shippableTotal / FREE_SHIP_THRESHOLD) * 100) : 100;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  // Style › Cart drawer › Terms checkbox (off by default): the bag's checkout button waits for the tick.
  const askTerms = design.cartDrawerShowTermsCheckbox === true;
  const [agreedTerms, setAgreedTerms] = useState(() => termsAgreed());
  const [termsError, setTermsError] = useState(false);
  const termsBox = useRef<HTMLInputElement>(null);
  const agreeTerms = (agreed: boolean) => { setAgreedTerms(rememberTermsAgreed(agreed)); if (agreed) setTermsError(false); };
  const goCheckout = () => {
    if (askTerms && !agreedTerms) { setTermsError(true); termsBox.current?.focus(); return; }
    setIsCartOpen(false); navigate("/checkout");
  };

  // Style › Cart drawer › After adding a book: the bag (default) or a small notice in its corner.
  const noticeMode = addedNoticeOn(design);
  const setAddBehaviour = useRef(shopper.setAddBehaviour);
  setAddBehaviour.current = shopper.setAddBehaviour;
  useEffect(() => {
    setAddBehaviour.current?.(noticeMode ? "notice" : "drawer");
    return () => setAddBehaviour.current?.("drawer");
  }, [noticeMode]);
  useEffect(() => { if (isCartOpen && shopper.lastAdded) shopper.dismissAdded?.(); }, [isCartOpen]);

  // Style › Cart drawer › Tab reminder (off by default): while the shopper is on another tab with books in
  // the bag, the tab title says so; their own page title comes back when they return.
  const shopperCount = shopper.cart.reduce((n, i) => n + (i.quantity || 0), 0);
  const reminderWords = tabReminderOn(design) ? tabReminderTitle(getCopy(design, "cartTabReminder", { count: shopperCount })) : "";
  const reminderActive = !!reminderWords && tabReminderApplies(true, shopperCount, location.pathname, inEditorPreview());
  useEffect(() => {
    if (!reminderActive || typeof document === "undefined") return;
    let saved: string | null = null;
    const restore = () => {
      if (saved === null) return;
      const back = titleToRestore(document.title, reminderWords, saved);
      if (back !== null) document.title = back;
      saved = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (saved === null) { saved = document.title; document.title = reminderWords; }
      } else restore();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); restore(); };
  }, [reminderActive, reminderWords, location.pathname]);

  return (
    <>
    {noticeMode && !isCartOpen && (
      <AddedToBagNotice design={design} added={shopper.lastAdded} count={shopper.cartCount}
        onDismiss={() => shopper.dismissAdded?.()} onViewBag={() => setIsCartOpen(true)} formatPrice={formatPrice} />
    )}
    <AnimatePresence>
      {isCartOpen && (
        <>
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsCartOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-[60] ${backdropBlur ? "backdrop-blur-sm" : ""}`}
            style={{ backgroundColor: design.cartDrawerBackdropColor || "rgba(0, 0, 0, 0.55)" }}
          />
          <m.div
            ref={drawerRef}
            role="dialog"
            data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Cart drawer"
            aria-modal="true"
            aria-label={getCopy(design, "cartTitle")}
            tabIndex={-1}
            data-fm-store
            data-fm-checkout
            initial={{ x: fromLeft ? "-100%" : "100%" }} animate={{ x: 0 }} exit={{ x: fromLeft ? "-100%" : "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className={`fm-bag fixed top-0 h-[100dvh] w-full z-[70] flex flex-col ${fromLeft ? "left-0" : "right-0"}`}
            style={{ maxWidth: cartDrawerWidth(design) }}
          >
            <StorefrontThemeStyle design={design} />
            <style>{cartDrawerCss(design)}</style>
            {cartDrawerFontNames(design).map((n) => <link key={n} rel="stylesheet" href={googleFontHref(n)} />)}

            {/* Header: title, count, close */}
            <div data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag heading" className="fm-bag-pad fm-bag-head fm-bag-rule border-b pt-8 pb-5 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <h2 className="fm-bag-title">{getCopy(design, "cartTitle")}</h2>
                {showCount && cart.length > 0 && <p className="fm-bag-meta mt-2">{getCopy(design, "cartCountLabel", { count: itemCount })}</p>}
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                aria-label={getCopy(design, "cartCloseAria")}
                className="fm-bag-close shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Free shipping meter */}
            {cart.length > 0 && showFreeShipBar && FREE_SHIP_THRESHOLD != null && (
              <div data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Free-shipping bar" className="fm-bag-pad fm-bag-meter fm-bag-rule border-b py-4" role="status">
                <div className="fm-bag-meta flex items-center gap-2 mb-2">
                  <Truck size={13} aria-hidden="true" />
                  <span>{remaining > 0 ? getCopy(design, "cartFreeShipAway", { amount: formatPrice(remaining) }) : getCopy(design, "cartFreeShipQualified")}</span>
                </div>
                <div className="fm-bag-track" aria-hidden="true">
                  <div className="fm-bag-fill" data-done={remaining > 0 ? undefined : ""} style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {/* Line items */}
              {cart.length > 0 && (
                <ul data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag line items" className="fm-bag-pad">
                  {cart.map((item, idx) => {
                    const key = item.lineKey || `${item.id}::${item.variantId || ""}`;
                    // Lines of the same edition with different extras share its stock.
                    const siblings = cart.filter((other) => other !== item && other.id === item.id && (other.variantId || "") === (item.variantId || "")).reduce((n, other) => n + other.quantity, 0);
                    const atLimit = typeof item.stockLimit === "number" && item.stockLimit !== 999 && item.quantity + siblings >= item.stockLimit;
                    const giftTo = item.giftCardDetails ? (item.giftCardDetails.recipientName || item.giftCardDetails.recipientEmail || "").trim() : "";
                    return (
                      <li key={key} className="fm-bag-item flex gap-4 py-5">
                        {showNumbers && <span className="fm-bag-num pt-0.5" aria-hidden="true">{pad2(idx + 1)}</span>}
                        {showThumbs && (
                          <div className="fm-bag-thumb">
                            {item.photoUrl && <img src={item.photoUrl} alt="" loading="lazy" decoding="async" className={`w-full h-full object-cover ${grayscaleThumbs ? "grayscale" : ""}`} />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex justify-between gap-3 items-start">
                            <h3 className="fm-bag-name max-md:[overflow-wrap:anywhere]">{item.title}</h3>
                            {showLineTotal && (
                              <span className="fm-bag-line" translate="no">
                                {savings?.perCopy.get(item) ? (() => {
                                  const was = formatPrice((item.price + (savings.perCopy.get(item) as number)) * item.quantity);
                                  return <s className="fm-bag-was"><span className="sr-only">{getCopy(design, "cartYouSaveWasAria", { price: was })}</span><span aria-hidden="true">{was}</span></s>;
                                })() : null}
                                {formatPrice(item.price * item.quantity)}
                              </span>
                            )}
                          </div>
                          {item.variantName && <p className="fm-bag-meta">{item.variantName}</p>}
                          {showLineOptions && (item.addOns || []).map((addOn) => (
                            <p key={addOn.id} className="fm-bag-meta fm-bag-addon">
                              {getCopy(design, "cartAddOnLine", { label: addOn.label })}
                              {addOn.text ? <> {getCopy(design, "cartAddOnText", { text: addOn.text })}</> : null}
                            </p>
                          ))}
                          {showLineOptions && item.giftCard && <p className="fm-bag-meta fm-bag-giftcard">{giftTo ? getCopy(design, "cartGiftCardTo", { recipient: giftTo }) : getCopy(design, "cartGiftCardSelf")}</p>}
                          {showLineOptions && item.bundle && (item.bundleCount || 0) > 0 && <p className="fm-bag-meta fm-bag-boxset">{getCopy(design, "cartBoxSetIncludes", { count: item.bundleCount as number })}</p>}
                          {showPreorder && linePreorderNote(item, (k, v) => getCopy(design, k, v)) && <p className="fm-bag-meta fm-bag-preorder">{linePreorderNote(item, (k, v) => getCopy(design, k, v))}</p>}
                          {showUnitPrice && <p className="fm-bag-meta">{getCopy(design, "cartEachLabel", { price: formatPrice(item.price) })}</p>}
                          {savings?.perCopy.get(item) ? <p className="fm-bag-meta fm-bag-saving" translate="no">{getCopy(design, "cartYouSaveLine", { amount: formatPrice((savings.perCopy.get(item) as number) * item.quantity) })}</p> : null}
                          <div className="flex items-center justify-between gap-3 mt-auto pt-2">
                            <div className="fm-bag-qty" data-style={qtyStyle} role="group" aria-label={getCopy(design, "cartQtyAria", { title: item.title })}>
                              <button onClick={() => updateQuantity(key, -1)} disabled={item.quantity <= 1} aria-label={getCopy(design, "cartDecreaseAria", { title: item.title })} className="fm-bag-qty-btn min-w-[40px] min-h-[40px] flex items-center justify-center disabled:opacity-30 transition-colors"><Minus size={12} /></button>
                              <span className="fm-bag-qty-n" aria-live="polite" aria-atomic="true">{item.quantity}</span>
                              <button onClick={() => updateQuantity(key, 1)} disabled={atLimit || item.quantity >= MAX_LINE_QUANTITY} aria-label={getCopy(design, "cartIncreaseAria", { title: item.title })} className="fm-bag-qty-btn min-w-[40px] min-h-[40px] flex items-center justify-center disabled:opacity-30 transition-colors"><PlusIcon size={12} /></button>
                            </div>
                            <div className="flex items-center gap-3">
                              {showSaveForLater && canSaveForLater(item) && (
                                <button
                                  type="button"
                                  onClick={() => saveForLater(key, item, idx)}
                                  aria-label={getCopy(design, "cartSaveLaterAria", { title: item.title })}
                                  data-studio-target="style:cartDrawer|copy:Cart"
                                  data-studio-label="Save for later button"
                                  className="fm-bag-remove fm-bag-save fm-bag-meta min-h-[44px] flex items-center justify-center transition-colors"
                                >
                                  {getCopy(design, "cartSaveLater")}
                                </button>
                              )}
                              <button
                                onClick={() => removeWithUndo(key, item, idx)}
                                aria-label={getCopy(design, "cartRemoveAria", { title: item.title })}
                                className="fm-bag-remove fm-bag-meta min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                              >
                                {removeAsIcon ? <Trash2 size={14} aria-hidden="true" /> : getCopy(design, "cartRemoveLabel")}
                              </button>
                            </div>
                          </div>
                          {atLimit && <p className="fm-bag-warn fm-bag-meta" role="status">{getCopy(design, "cartOnlyAvailable", { count: Math.max(0, (item.stockLimit as number) - siblings) })}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {cart.length === 0 && (
                <div data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Empty bag" className="fm-bag-pad py-20 flex flex-col items-center text-center gap-5">
                  {showEmptyIcon && (
                    <div className="fm-bag-empty-icon w-16 h-16 flex items-center justify-center">
                      <ShoppingBag size={24} aria-hidden="true" />
                    </div>
                  )}
                  <p className="fm-bag-meta">{getCopy(design, "cartEmpty")}</p>
                  {showEmptyButton && (
                    <button onClick={continueShopping} className="fm-bag-cta px-6 min-w-[220px] flex items-center justify-center gap-3">
                      {getCopy(design, "cartContinue")}
                    </button>
                  )}
                </div>
              )}

              {emptyPicks.length > 0 && (
                <div data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Empty bag suggestions" className="fm-bag-pad fm-bag-rule fm-bag-empty-picks border-t pt-6 pb-8">
                  <p className="fm-bag-meta mb-4">{getCopy(design, "cartEmptyPicksHeading")}</p>
                  <ul className="space-y-3">
                    {emptyPicks.map((book: any) => (
                      <li key={book.id} className="fm-bag-upsell flex flex-wrap md:flex-nowrap gap-4 p-4 items-center">
                        <div className="fm-bag-thumb" style={{ width: "56px" }}>
                          {book.photos?.[0]?.url && <img loading="lazy" decoding="async" src={smallPhotoUrl(book.photos[0])} alt="" className={`w-full h-full object-cover ${grayscaleThumbs ? "grayscale" : ""}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="fm-bag-name fm-bag-upsell-name" title={book.title}>
                            <Link to={`/books/${bookSlug(book)}`} onClick={() => setIsCartOpen(false)} className="hover:underline">{breakableTitle(book.title)}</Link>
                          </h3>
                          <p className="fm-bag-meta mt-1 whitespace-nowrap" translate="no">{formatPrice(catalogUnitPrice(book, recommendedChoice(book)))}</p>
                        </div>
                        <button onClick={() => addToCart(book, recommendedChoice(book))} aria-label={getCopy(design, "cartEmptyPicksAddAria", { title: book.title || "" })} className="fm-bag-upsell-btn shrink-0 px-4 min-h-[44px] w-full md:w-auto">
                          {getCopy(design, "cartEmptyPicksAdd")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cart.length > 0 && (design.cartDrawerShowShippingPreview ?? true) && <CartShippingPreview cart={cart} design={design} formatPrice={formatPrice} onEstimate={setShippingEstimate} />}
              {cart.length > 0 && design.cartDrawerShowDiscountCode === true && <CartDiscountCode design={design} />}
              {cart.length > 0 && design.cartDrawerShowOrderNote === true && <CartOrderNote design={design} />}

              {/* Complete your collection */}
              {cart.length > 0 && showUpsell && recommendedBook && (
                <div data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag suggestion" className="fm-bag-pad fm-bag-rule border-t pt-6 pb-8">
                  <p className="fm-bag-meta mb-4">{getCopy(design, "cartUpsellHeading")}</p>
                  <div className="fm-bag-upsell flex flex-wrap md:flex-nowrap gap-4 p-4 items-center">
                    <div className="fm-bag-thumb" style={{ width: "56px" }}>
                      {recommendedBook.photos?.[0]?.url && <img loading="lazy" decoding="async" src={smallPhotoUrl(recommendedBook.photos[0])} alt="" className={`w-full h-full object-cover ${grayscaleThumbs ? "grayscale" : ""}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="fm-bag-name fm-bag-upsell-name" title={recommendedBook.title}>{breakableTitle(recommendedBook.title)}</h3>
                      <p className="fm-bag-meta mt-1 whitespace-nowrap" translate="no">{formatPrice(catalogUnitPrice(recommendedBook, recommendedChoice(recommendedBook)))}</p>
                    </div>
                    <button onClick={() => addToCart(recommendedBook, recommendedChoice(recommendedBook))} className="fm-bag-upsell-btn shrink-0 px-4 min-h-[44px] w-full md:w-auto">
                      {getCopy(design, "cartUpsellAdd")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Summary ledger + checkout */}
            {cart.length > 0 && (
              <div data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag total & checkout" className="fm-bag-pad fm-bag-summary pt-5 pb-6 space-y-4">
                {showShipBy && <CartShipBy design={design} />}
                {showSummary && (
                  <div className="space-y-2">
                    <div className="fm-bag-row fm-bag-meta"><span>{getCopy(design, "cartSubtotalLabel")}</span><span translate="no">{formatPrice(cartTotal)}</span></div>
                    <div className="fm-bag-row fm-bag-meta"><span>{getCopy(design, "cartShippingLabel")}</span><span>{shippingEstimate !== null && (design.cartDrawerShowShippingPreview ?? true) ? formatPrice(shippingEstimate) : getCopy(design, "cartShippingValue")}</span></div>
                  </div>
                )}
                {savings && savings.total > 0 && (
                  <div className="fm-bag-row fm-bag-meta fm-bag-saving" data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag sale savings">
                    <span>{getCopy(design, "cartYouSaveLabel")}</span><span translate="no">{formatPrice(savings.total)}</span>
                  </div>
                )}
                <div className={`fm-bag-row ${showSummary ? "fm-bag-total pt-3" : ""}`}>
                  <span className="fm-bag-meta">{getCopy(design, "cartTotalLabel")}</span>
                  <span className="fm-bag-total-n" translate="no">{formatPrice(cartTotal + ((design.cartDrawerShowShippingPreview ?? true) ? shippingEstimate || 0 : 0))}</span>
                </div>

                {showTrustBadges && (
                  <ul className="fm-bag-badges fm-bag-meta grid gap-2" style={{ gridTemplateColumns: `repeat(${trustBadges.length}, minmax(0, 1fr))` }}>
                    {trustBadges.map(({ key, Icon, copy }) => (
                      <li key={key} className="flex items-center justify-center gap-1.5 py-2"><Icon size={12} aria-hidden="true" /><span>{getCopy(design, copy)}</span></li>
                    ))}
                  </ul>
                )}

                {askTerms && <CartTermsAgree ref={termsBox} design={design} policies={(settings as any)?.policies} agreed={agreedTerms}
                  showError={termsError} onChange={agreeTerms} onLinkClick={() => setIsCartOpen(false)} />}
                <button onClick={goCheckout} className="fm-bag-cta w-full flex items-center justify-center gap-3">
                  {getCopy(design, "cartCheckoutButton")} {showArrow && <ArrowRight size={16} aria-hidden="true" />}
                </button>
                {showDeliveryNote && <p className="fm-bag-meta text-center" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{getCopy(design, "cartDeliveryNote")}</p>}
              </div>
            )}
          </m.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}
