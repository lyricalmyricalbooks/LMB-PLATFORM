import { readCartDestination, prefillCartAddress } from "./features/site/cartDestination";
import { orderAcquisition } from "./lib/visitSource";
import { regionProps } from "./features/site/storefrontRegions";
import { TRACKING_CSS } from "./features/site/trackingStyle";
import { consentAllows } from "./lib/consent";
import { trackLink } from "./features/site/orderStatus";
import { liveCheckoutRates } from "./features/site/canadaPostRates";
import { resolveSurfaceDesign } from "./features/site/surfaceDesign";
import { applyFavicon } from "./features/site/favicon";
import React, { useState, useEffect, useMemo, useReducer, useRef } from "react";
import { Link } from "react-router";
import { useCart, catalogUnitPrice, repriceCart } from "./CartContext";
import { sameOrderLines } from "./features/site/orderLines";
import { amountIn, orderMoney, orderChargedTotal, totalNeedsConfirming } from "./features/site/orderMoney";
import { cardAttemptKey, intentIdOf, mayHaveGoneThrough, paymentSettled, reusableCardOrder, type PendingCardOrder } from "./features/site/cardAttempt";
import { POLICY_KEYS, policySlug, policyTitle } from "./features/site/policyPages";
import { ChevronLeft, Tag, X, AlertCircle, CreditCard, Package, CheckCircle2, Loader2, Lock, Building } from "lucide-react";
import { m } from "motion/react";
import { adminApi } from "./admin/api";
import { publicApi } from "./lib/publicApi";
import { abandonedCartApi, funnelApi } from "./lib/commerce";
import { ga4Items, ga4Once } from "./lib/ga4";
import { functionFetch } from "./lib/functionsBase";
import { useSEO } from "./lib/seo";
import { useCurrency } from "./CurrencyContext";
import { quoteShipping, parseWeightGrams } from "./features/site/shippingEngine";
import { TemplateSections, GlobalSections } from "./components/sectionRender";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc, collection } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { AppVerificationError } from "../lib/appVerification";
import { StorefrontThemeStyle } from "./features/site/StorefrontThemeStyle";
import { accountsEnabled } from "./features/site/customerAccounts";
import { getCopy, CopyError, copyErrorText } from "./features/site/storeCopy";
import { DEFAULT_SETTINGS } from "./features/site/constants";
import { subscribePreview } from "./features/site/previewTab";
import { CHECKOUT_ATTEMPT_KEY, orderAccessHeaders, rememberOrderAccess } from "./lib/orderAccessClient";
import { StripeCardForm, type StripeCardFormHandle } from "./features/site/StripeCardForm";
import { StripePaymentSection } from "./features/site/StripePaymentSection";
import { isStripePublishableKey, stripeCheckoutState, createCheckoutSubmission, onPageRestored } from "./features/site/stripeLifecycle";
import { checkoutFlow, confirmationView, initialFlow, readReturn, stripeTookPayment } from "./features/site/checkoutFlow";
import { checkoutDetailProblems, detailInputId, expressWalletEnabled, type DetailField } from "./features/site/checkoutDetails";
import { createLatestGuard, signalWithTimeout, RATES_TIMEOUT_MS } from "./features/site/latestRequest";
import { liveRatesAddressReady, shouldRefetchRates } from "./features/site/liveRateRequest";
import { holdLimitsFrom, holdWarnings } from "./features/site/holdLimits";
import { freeShippingGap } from "./features/site/checkoutNudges";
import { guessCountryName, parsePinned } from "./features/site/countryPicker";
import { activeTaxRates, matchTaxRate } from "./features/site/taxRate";
import { provinceFromPostal, cleanRegion, regionsFor } from "./features/site/postalRegion";
import { readSiteCache } from "./features/site/siteCache";
import { loadCatalog } from "./features/site/loadCatalog";
import { currentStorefrontData, fetchStorefrontDataFile, shippingProfilesFrom } from "./features/site/storefrontDataFile";
import { quoteLocalFulfillment } from "./features/site/localFulfillment";
import { catalogFulfillmentItems, discountedPhysicalSubtotal } from "./features/site/checkoutFulfillment";
import { bagPreorder } from "./features/site/preorder";
import { discountAmountFor, discountableItems, pickAutomaticDiscount } from "./features/site/discountMath";
import { expandDiscountCategories } from "./features/site/discountCategories";
import { clearSharedDiscount, sharedDiscount } from "./features/site/sharedDiscount";
import { bagNote, orderNoteBoxOn, rememberBagNote } from "./features/site/bagNote";
import { isGiftCardProduct, bundleComponents, bundleWeightGrams } from "./features/site/promotions";
import { isLiveBook } from "./features/site/liveBook";
import { previewSampleCart } from "./features/site/previewSampleCart";
import { inEditorPreview } from "./lib/trackingGuard";
import { bestFirst, type FulfillmentSelection } from "./features/site/FulfillmentMethodPicker";
import { smallPhotoUrl } from "./features/site/photoSources";
import { googleFontHref } from "./features/site/fonts";
import { checkoutLabelsAbove, checkoutMarker, checkoutPayBarOn, checkoutPayTabs, checkoutSlipCss, checkoutSlipFontNames, splitBrand } from "./features/site/checkoutSlipStyle";

import { LabelsAbove } from "./features/site/CheckoutFields";
import { CheckoutAddressStep, type CheckoutCustomer } from "./features/site/CheckoutAddressStep";
import { CheckoutDeliveryStep } from "./features/site/CheckoutDeliveryStep";
import { CheckoutPaymentStep } from "./features/site/CheckoutPaymentStep";
import { CheckoutOrderSummary } from "./features/site/CheckoutOrderSummary";

// ─── Main component ───────────────────────────────────────────────────────────

// Practical email check before any order is created: something@domain.tld, no spaces.
// Stripe and PayPal refuse charges below about 50 cents in CAD, USD and EUR.
const MIN_CARD_CHARGE = 0.5;


// This tab's last unpaid checkout attempt. Sent with the next attempt so the server can free
// the stock that attempt was holding (only if it is still unpaid and has the same email).
const ATTEMPT_KEY = CHECKOUT_ATTEMPT_KEY;
function previousAttempt(): string | undefined {
  try { return sessionStorage.getItem(ATTEMPT_KEY) || undefined; } catch { return undefined; }
}
function rememberAttempt(orderId: string) {
  try { sessionStorage.setItem(ATTEMPT_KEY, orderId); } catch { /* storage blocked */ }
}
// The attempt became an order (paid, paying or placed): a later purchase in this tab is a new one,
// not a retry the server should compare with it.
function forgetAttempt(orderId: string) {
  try { if (sessionStorage.getItem(ATTEMPT_KEY) === orderId) sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* storage blocked */ }
}

export function Checkout() {
  const { cart: shopperCart, cartTotal: shopperTotal, cartCount: shopperCount, clearCart, setCart: setShopperCart } = useCart();
  const paypalConfirmedAmount = useRef<{ amount: number; currency: string } | null>(null);
  const { currency, formatPrice, convertPrice } = useCurrency();

  const [isApplying, setIsApplying]     = useState(false);
  // Form → paying → confirming (features/site/checkoutFlow.ts); the page only draws it.
  const [flow, dispatchFlow] = useReducer(checkoutFlow, initialFlow);
  const isCompleting = flow.step === "paying";
  const submitPurchase = useRef(createCheckoutSubmission());
  const purchaseNavigating = useRef(false);
  const serverSaysFree = useRef(false);
  // Starts from the bag's note (Style › Cart drawer › Order note box) and keeps it in step.
  const [orderNote, setOrderNoteState] = useState(() => bagNote());
  const setOrderNote = (value: string) => setOrderNoteState(rememberBagNote(value));
  // Style › Checkout › policy tick box (off by default): Pay and the express wallet wait for it.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  // Per-field problems found when the shopper pressed Pay (cleared as each is fixed).
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DetailField, string>>>({});
  const ratesGuard = useRef(createLatestGuard());
  // Announced inline message (replaces alert()); tone drives colour, glyph + words carry the meaning.
  const [notice, setNotice] = useState<null | { tone: "error" | "info"; text: string }>(null);

  const [discountCode, setDiscountCode]       = useState("");
  // Hidden behind a "Have a code?" link so shoppers without one don't leave to hunt for one.
  const [discountOpen, setDiscountOpen]       = useState(false);
  // Order summary on phones starts collapsed unless Studio says otherwise.
  const [summaryOpen, setSummaryOpen]         = useState(false);
  // A payment problem can appear while the shopper is at the phone Pay bar: bring the message into view.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = noticeRef.current;
    if (notice?.tone !== "error" || !el || typeof window === "undefined") return;
    const box = el.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight - 160) el.scrollIntoView({ block: "center" });
  }, [notice]);
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
  const [discountError, setDiscountError]     = useState("");
  // Automatic offers (Discounts › Automatic) — the server applies the same choice when no code is used.
  const [autoOffers, setAutoOffers] = useState<any[]>([]);
  // Gift cards typed into checkout's "Gift card" box (balances as last checked; the server re-checks).
  const [giftCards, setGiftCards] = useState<Array<{ code: string; last4: string; balanceMinor: number }>>([]);
  const [giftCardOpen, setGiftCardOpen] = useState(false);
  const [giftCardInput, setGiftCardInput] = useState("");
  const [giftCardError, setGiftCardError] = useState("");
  const [giftCardApplying, setGiftCardApplying] = useState(false);
  const [shippoRatesLoading, setShippoRatesLoading] = useState(false);
  // Bumped when the server refuses Pay because the shown rates aren't the carrier's current ones.
  const [ratesRefresh, setRatesRefresh] = useState(0);


  const cartDestination = useRef(readCartDestination());
  const initialCountry = useRef(cartDestination.current?.country || guessCountryName() || "Canada");
  const [customer, setCustomer] = useState<CheckoutCustomer>({
    name: "", email: "", phone: "",
    address: { street: "", unit: "", city: "", state: "", zip: cartDestination.current?.postalCode || "", country: initialCountry.current },
    billingAddress: { state: "", country: "Canada" }
  });

  const [taxCost, setTaxCost] = useState(0);
  const [shippingProfiles, setShippingProfiles] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  // Reuse the storefront's same-session snapshot immediately. Checkout still
  // refreshes in the background, but returning to/from it no longer waits for
  // duplicate settings and catalog reads before it can paint.
  const cachedSite = useMemo(() => readSiteCache(), []);
  const [books, setBooks] = useState<any[]>(() => cachedSite?.books || []);
  // Prices, stock and shipping are only trusted once checkout has read the live catalog itself.
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "failed">("loading");
  // Studio preview with an empty bag: one display-only sample book (never saved), so checkout's
  // look, words and Cart sections can be edited. Shoppers always get their real bag.
  const previewSample = useMemo(() => inEditorPreview() && shopperCart.length === 0
    ? previewSampleCart(books.length ? books : (window as any).__studioPreviewState?.books || []) : [], [shopperCart.length, books]);
  const cart = previewSample.length ? previewSample : shopperCart;
  const cartTotal = previewSample.length ? previewSample.reduce((sum, item) => sum + item.price * item.quantity, 0) : shopperTotal;
  const cartCount = previewSample.length ? previewSample.length : shopperCount;
  const setCart: typeof setShopperCart = previewSample.length ? () => {} : setShopperCart;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const cartRestoreDone = useRef(false);
  const [settings, setSettings] = useState<any>(() => cachedSite?.settings || null);
  // Until the saved settings arrive (or if they never do) checkout wears the Riso Noir defaults.
  const checkoutDesign = resolveSurfaceDesign(settings?.design ?? DEFAULT_SETTINGS.design, "/checkout");
  const checkoutPolicies = POLICY_KEYS.filter(k => Boolean(String((settings as any)?.policies?.[k] || "").trim()));
  // Only with a policy to agree to; a ticked box needs no reminder.
  const termsRequired = Boolean(checkoutDesign.requireCheckoutTerms) && checkoutPolicies.length > 0;
  useEffect(() => { if (termsAccepted) setTermsError(false); }, [termsAccepted]);
  useEffect(() => { if (settings?.design?.checkoutSummaryOpenOnPhones) setSummaryOpen(true); }, [settings?.design?.checkoutSummaryOpenOnPhones]);
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(checkoutDesign, key, vars);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("stripe");
  const [successOrder, setSuccessOrder] = useState<any>(null);
  // Stripe card form shown on this page; a failed attempt keeps its order +
  // PaymentIntent so retrying with the same bag doesn't create another order.
  const cardFormRef = useRef<StripeCardFormHandle>(null);
  const [cardState, setCardState] = useState<"loading" | "ready" | "error">("loading");
  const [cardFormAttempt, setCardFormAttempt] = useState(0);
  const [inlineAttemptStarted, setInlineAttemptStarted] = useState(false);
  const pendingCardOrder = useRef<PendingCardOrder | null>(null);
  const stripePublicKey: string = (settings?.payments?.testMode
    ? settings?.payments?.stripe?.testPublicKey
    : settings?.payments?.stripe?.publicKey) || "";
  // Stripe fields stay inline regardless of older saved redirect settings.
  const pinnedCountryCodes = useMemo(() => parsePinned(checkoutDesign.checkoutPinnedCountries || undefined), [checkoutDesign.checkoutPinnedCountries]);
  const stripeKeyValid = isStripePublishableKey(stripePublicKey, Boolean(settings?.payments?.testMode));
  const stripeRoute = stripeCheckoutState({
    keyValid: stripeKeyValid,
    cardState,
    paymentStarted: inlineAttemptStarted,
  });
  const useCardForm = stripeRoute.inline;

  const [currentUser, setCurrentUser] = useState<any>(null);

  // ⚡ Bolt: Cache book catalog in an O(1) Map to prevent O(N * M)
  // nested lookups during checkout cart and discount iteration.
  const booksMap = useMemo(() => {
    const map = new Map<string, any>();
    books.forEach(b => map.set(b.id, b));
    return map;
  }, [books]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setCurrentUser(u);
      if (u) {
        try {
          const profRef = doc(db, "customers", u.uid);
          const profSnap = await getDoc(profRef);
          if (profSnap.exists()) {
            const data = profSnap.data();
            setCustomer(prev => ({
              name: data.name || u.displayName || prev.name,
              email: u.email || prev.email,
              phone: data.phone || prev.phone,
              billingAddress: prev.billingAddress,
              address: prefillCartAddress(prev.address, { ...data.defaultAddress, state: cleanRegion(data.defaultAddress?.state) }, cartDestination.current)
            }));
          } else {
            setCustomer(prev => ({
              ...prev,
              name: u.displayName || prev.name,
              email: u.email || prev.email,
            }));
          }
        } catch (err) {
          console.warn("Prefill customer address failed:", err);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.warn("Checkout login failed:", err);
      // Closing the pop-up is the shopper's own choice, not an error.
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
      setNotice({ tone: "error", text: c("coGoogleSignInError") });
    }
  };

  useEffect(() => {
    async function loadFulfillmentSettings() {
      try {
        // The catalog file on Hosting when the catalog marker proves nothing changed since its snapshot (the same
        // check the shop makes, so it equals a Firestore read now); otherwise the live Firestore reads. The server
        // still prices every payment and checkout confirms a changed total before charging.
        const file = await currentStorefrontData(fetchStorefrontDataFile, publicApi.getCatalogVersion, { fresh: true });
        const [profiles, siteSettings, bookList] = file ? await Promise.all([
          shippingProfilesFrom(file) || adminApi.getShippingProfiles(),
          publicApi.publicSettingsFrom(file.settings as any),
          file.books as any[],
        ]) : await Promise.all([
          adminApi.getShippingProfiles(),
          adminApi.getPublicSettings() as Promise<any>,
          // Same ID-ordered reader as the shop, so books saved without createdAt are not missing here.
          loadCatalog((size, cursor) => adminApi.getStorefrontBooks(size, cursor))
        ]);
        setShippingProfiles(profiles);
        setTaxRates(activeTaxRates(siteSettings));
        setBooks(bookList);
        setCatalogState("ready");
        const preview = new URLSearchParams(window.location.search).get("preview") === "true";
        const design = preview ? (window as any).__studioPreviewDesign || siteSettings?.design : siteSettings?.design;
        setSettings({ ...siteSettings, design: resolveSurfaceDesign(design, "/checkout") });
        applyFavicon(design);
        // The payment method follows the loaded settings (effect below), keeping the shopper's own choice.
      } catch (err) {
        console.error("Failed to load checkout settings", err);
        setCatalogState("failed");
      }
    }
    loadFulfillmentSettings();
  }, []);

  // Once the payment settings are known, a method the shop doesn't offer (e.g. the "stripe" default in a
  // PayPal- or manual-only shop) gives way to the first one it does; a valid choice is never overridden.
  useEffect(() => {
    const payments = settings?.payments;
    if (!payments) return;
    const offered = [
      ...(payments.stripe?.connected ? ["stripe"] : []),
      ...(payments.paypal?.connected ? ["paypal"] : []),
      ...(Array.isArray(payments.manualMethods) ? payments.manualMethods : []).filter((m: any) => m?.enabled).map((m: any) => `manual_${m.id}`),
    ];
    if (offered.length && !offered.includes(selectedPaymentMethod)) setSelectedPaymentMethod(offered[0]);
  }, [settings?.payments, selectedPaymentMethod]);

  // Preview only replaces appearance; fulfillment and payment settings stay server-sourced.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") !== "true") return;
    const stop = subscribePreview((preview) => setSettings((current: any) => ({ ...current, design: resolveSurfaceDesign(preview.design, "/checkout") })));
    window.parent.postMessage({ type: "PREVIEW_READY" }, window.location.origin);
    return stop;
  }, []);

  // Recover cart if cartId query parameter is present in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCartId = params.get("cartId");
    if (!urlCartId || catalogState !== "ready" || cartRestoreDone.current) return;
    // Restore once, then drop cartId from the address so a reload keeps the shopper's current bag.
    cartRestoreDone.current = true;
    params.delete("cartId");
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`);

    (async () => {
      try {
        const cartRef = doc(db, "abandoned-carts", urlCartId);
        const cartSnap = await getDoc(cartRef);
        if (cartSnap.exists()) {
          const cartData = cartSnap.data();
          if (cartData.recovered) {
            console.log("Cart already recovered");
            return;
          }

          // Prefill customer details
          if (cartData.customer) {
            setCustomer(prev => ({
              ...prev,
              name: cartData.customer.name || prev.name,
              email: cartData.customer.email || cartData.email || prev.email,
              phone: cartData.customer.phone || prev.phone,
              address: prefillCartAddress(prev.address, { ...cartData.customer.address, state: cleanRegion(cartData.customer.address?.state) }, cartDestination.current)
            }));
          } else if (cartData.email) {
            setCustomer(prev => ({
              ...prev,
              email: cartData.email,
            }));
          }

          // Save cart ID in sessionStorage to keep updating it and resolve it later
          sessionStorage.setItem("fm_checkout_cart_id", urlCartId);

          // Restore cart items
          const localBooksMap = new Map(books.map(b => [b.id, b]));
          const restoredItems = (cartData.items || []).map((item: any) => {
            const matchedBook = localBooksMap.get(item.id);
            if (matchedBook) {
              const photoUrl = smallPhotoUrl(matchedBook.photos?.[0]);
              const shippingProfileId = matchedBook.shippingProfileId || "";

              let variantName = item.variantName || "";
              let stripePriceId = item.stripePriceId || "";
              let price = item.price;

              if (item.variantId) {
                const matchedVariant = matchedBook.variants?.find((v: any) => v.id === item.variantId);
                if (matchedVariant) {
                  variantName = matchedVariant.name;
                  price = catalogUnitPrice(matchedBook, matchedVariant);
                  if (matchedVariant.stripePriceId) stripePriceId = matchedVariant.stripePriceId;
                }
              } else {
                price = catalogUnitPrice(matchedBook);
                if (matchedBook.stripePriceId) stripePriceId = matchedBook.stripePriceId;
              }

              return {
                id: item.id,
                variantId: item.variantId || undefined,
                variantName: variantName || undefined,
                title: item.title || matchedBook.title,
                price: Number.isFinite(price) ? price : item.price,
                quantity: item.qty || item.quantity || 1,
                photoUrl: item.photoUrl || photoUrl,
                stripePriceId: stripePriceId || undefined,
                shippingProfileId: item.shippingProfileId || shippingProfileId,
              };
            }
            return {
              id: item.id,
              variantId: item.variantId || undefined,
              variantName: item.variantName || undefined,
              title: item.title,
              price: item.price,
              quantity: item.qty || item.quantity || 1,
              photoUrl: item.photoUrl || "",
              stripePriceId: item.stripePriceId || undefined,
              shippingProfileId: item.shippingProfileId || "",
            };
          });

          if (restoredItems.length > 0) {
            clearCart();
            setCart(restoredItems);
          }
        }
      } catch (err) {
        console.error("Failed to recover cart:", err);
      }
    })();
  }, [catalogState, books]);

  // A bag saved days ago may hold old prices or books that sold out: bring it in line with
  // the catalog the server will charge from, and say what changed.
  useEffect(() => {
    if (catalogState !== "ready" || !cart.length) return;
    const next = repriceCart(cart, books);
    if (!next.changed) return;
    setCart(next.cart);
    if (next.removed.length || next.repriced.length) {
      setNotice({ tone: "info", text: c("coBagUpdated", { items: [...next.removed, ...next.repriced].join(", ") }) });
    }
  }, [catalogState, books, cart]);

  useEffect(() => {
    if (catalogState !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await functionFetch("validateDiscountCode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "automaticDiscounts" }),
        });
        const data = res.ok ? await res.json() : null;
        if (!cancelled && Array.isArray(data?.discounts)) setAutoOffers(data.discounts.map((offer: any) => expandDiscountCategories(offer, settings?.design?.categories)));
      } catch {
        // No offers shown; the server still prices the order.
      }
    })();
    return () => { cancelled = true; };
  }, [catalogState, settings?.design?.categories]);

  // The starting country comes from the browser language (guessCountryName). No lookup sends the shopper's IP to a third party.

  const validateDiscountRestrictions = (discount: any, email: string, cartItems: any[], catalogMap: Map<string, any>, currentCartCount: number, currentCartTotal: number) => {
    // 1. Min quantity / min order amount
    // ⚡ Bolt: Replace O(N) array iteration with O(1) memoized cart count context value
    const totalQty = currentCartCount;
    if (discount.minQuantity && totalQty < discount.minQuantity) {
      throw new CopyError(checkoutDesign, "coErrMinItems", { count: discount.minQuantity });
    }
    // ⚡ Bolt: Replace O(N) array iteration with O(1) memoized cart total context value
    const itemsSubtotal = currentCartTotal;
    if (discount.minOrderAmount && itemsSubtotal < Number(discount.minOrderAmount)) {
      throw new CopyError(checkoutDesign, "coErrMinOrder", { amount: formatPrice(Number(discount.minOrderAmount)) });
    }

    // 2. Email domain / email list
    const hasEmailRestrictions = discount.restrictedToCustomers || (discount.allowedCustomerEmails && discount.allowedCustomerEmails.trim()) || 
                                  (discount.allowedEmailDomains && discount.allowedEmailDomains.trim());
    if (hasEmailRestrictions && !email.trim()) {
      throw new CopyError(checkoutDesign, "coErrNeedEmail");
    }

    if (email.trim()) {
      const lowerEmail = email.trim().toLowerCase();
      
      // Check specific customer emails
      if (discount.allowedCustomerEmails && discount.allowedCustomerEmails.trim()) {
        const allowedEmails = discount.allowedCustomerEmails.split(",")
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean);
        if (allowedEmails.length > 0 && !allowedEmails.includes(lowerEmail)) {
          throw new CopyError(checkoutDesign, "coErrVipEmails");
        }
      }

      // Check email domains
      if (discount.allowedEmailDomains && discount.allowedEmailDomains.trim()) {
        const allowedDomains = discount.allowedEmailDomains.split(",")
          .map((d: string) => d.trim().toLowerCase())
          .filter(Boolean);
        const matchesDomain = allowedDomains.some((domain: string) => {
          if (domain.startsWith(".")) {
            return lowerEmail.endsWith(domain);
          } else {
            return lowerEmail.endsWith("@" + domain) || lowerEmail.endsWith("." + domain);
          }
        });
        if (allowedDomains.length > 0 && !matchesDomain) {
          throw new CopyError(checkoutDesign, "coErrEmailDomains", { domains: discount.allowedEmailDomains });
        }
      }
    }

    // 3. Product / Category targeting
    if (discount.appliesTo === "categories") {
      const selectedCats = new Set(discount.selectedCategories || []);
      const hasMatchingCategory = cartItems.some(item => {
        const catalogBook = catalogMap.get(item.id);
        const bookCats = catalogBook && Array.isArray(catalogBook.categories) ? catalogBook.categories : [];
        return bookCats.some((cat: string) => selectedCats.has(cat));
      });
      if (!hasMatchingCategory) {
        throw new CopyError(checkoutDesign, "coErrCategories", { categories: (discount.selectedCategories || []).join(", ") });
      }
    } else if (discount.appliesTo === "products") {
      const selectedProds = new Set(discount.selectedProducts || []);
      const hasMatchingProduct = cartItems.some(item => selectedProds.has(item.id));
      if (!hasMatchingProduct) {
        throw new CopyError(checkoutDesign, "coErrProducts");
      }
    }

    // 4. BOGO & Tiered specific checks
    if (discount.type === "bogo") {
      const buyQty = Number(discount.buyQuantity) || 1;
      const getQty = Number(discount.getQuantity) || 1;
      const requiredUnits = buyQty + getQty;

      // ⚡ Bolt: Convert constraints to O(1) Sets outside the loop
      const bogoCats = new Set(discount.selectedCategories || []);
      const bogoProds = new Set(discount.selectedProducts || []);

      // Filter qualifying items
      const qualItems = cartItems.filter(item => {
        if (discount.appliesTo === "all" || discount.appliesTo === "catalog") return true;
        if (discount.appliesTo === "categories") {
          const catalogBook = catalogMap.get(item.id);
          const bookCats = catalogBook && Array.isArray(catalogBook.categories) ? catalogBook.categories : [];
          return bookCats.some((cat: string) => bogoCats.has(cat));
        }
        if (discount.appliesTo === "products") {
          return bogoProds.has(item.id);
        }
        return false;
      });

      const totalQualUnits = qualItems.reduce((sum, item) => sum + item.quantity, 0);
      if (totalQualUnits < requiredUnits) {
        throw new CopyError(checkoutDesign, "coErrBogo", { count: requiredUnits });
      }
    }

    if (discount.type === "tiered") {
      const tiers = discount.tiers || [];
      if (!Array.isArray(tiers) || tiers.length === 0) {
        throw new CopyError(checkoutDesign, "coErrTiered");
      }

      // ⚡ Bolt: Convert constraints to O(1) Sets outside the loop
      const tierCats = new Set(discount.selectedCategories || []);
      const tierProds = new Set(discount.selectedProducts || []);

      // Calculate qualifying subtotal
      const qualifyingSubtotal = cartItems.reduce((sum, item) => {
        if (discount.appliesTo === "all" || discount.appliesTo === "catalog") return sum + item.quantity * item.price;
        let qualifies = false;
        if (discount.appliesTo === "categories") {
          const catalogBook = catalogMap.get(item.id);
          const bookCats = catalogBook && Array.isArray(catalogBook.categories) ? catalogBook.categories : [];
          qualifies = bookCats.some((cat: string) => tierCats.has(cat));
        } else if (discount.appliesTo === "products") {
          qualifies = tierProds.has(item.id);
        }
        return qualifies ? sum + item.quantity * item.price : sum;
      }, 0);

      const lowestMinSpend = Math.min(...tiers.map(t => Number(t.minSpend)));
      if (qualifyingSubtotal < lowestMinSpend) {
        throw new CopyError(checkoutDesign, "coErrMinSpend", { amount: formatPrice(lowestMinSpend) });
      }
    }
  };

  const [availableRates, setAvailableRates] = useState<any[]>([]);
  // The physical free gift (if any) for the shipping quotes below; set once the discount is known.
  const freeGiftRef = useRef<null | { id: string; variantId?: string; price: number; quantity: number; shippingProfileId: string | null; weightGrams: number | null }>(null);
  const [fulfillmentSelection, setFulfillmentSelection] = useState<FulfillmentSelection>({ method: "shipping", optionId: "" });

  const shippingItemsForCart = () => cart.map((item) => {
    const book: any = booksMap.get(item.id);
    const variant = item.variantId ? (book?.variants || []).find((v: any) => v.id === item.variantId) : null;
    return {
      price: item.price,
      quantity: item.quantity,
      shippingProfileId: book?.shippingProfileId || null,
      weightGrams: parseWeightGrams(variant?.weight) ?? parseWeightGrams(book?.weight) ?? bundleWeightGrams(book, booksMap),
    };
  });

  const catalogItems = useMemo(() => catalogFulfillmentItems(cart, booksMap), [cart, booksMap]);

  // Same arithmetic as the server (one shared copy, src/shared/discountMath.ts):
  // gift cards are never discounted; a code replaces automatic offers; a free gift is a line
  // whose price is the discount.
  const booksById = useMemo(() => Object.fromEntries(booksMap), [booksMap]);
  const pricedLines = useMemo(() => cart.map(item => ({ ...item, giftCard: isGiftCardProduct(booksMap.get(item.id)) })), [cart, booksMap]);
  const discountableLines = useMemo(() => discountableItems(pricedLines), [pricedLines]);
  // Codes count only what they can discount (gift cards in the bag never qualify).
  const discountableTotal = useMemo(() => discountableLines.reduce((sum, item) => sum + item.price * item.quantity, 0), [discountableLines]);
  const discountableCount = useMemo(() => discountableLines.reduce((sum, item) => sum + item.quantity, 0), [discountableLines]);
  const giftCardLinesTotal = useMemo(() => pricedLines.filter(item => item.giftCard).reduce((sum, item) => sum + item.price * item.quantity, 0), [pricedLines]);
  const giftOffer = (offer: any) => {
    const book = booksMap.get(offer?.giftBookId);
    const variant = offer?.giftVariantId ? (book?.variants || []).find((v: any) => v.id === offer.giftVariantId) : undefined;
    if (!book || !isLiveBook(book) || isGiftCardProduct(book) || bundleComponents(book).length || (offer.giftVariantId && !variant)) return null;
    if (!offer.giftVariantId && Array.isArray(book.variants) && book.variants.length) return null;
    if (book.trackInventory && !book.allowBackorder) {
      const inBag = cart.filter(i => i.id === book.id && (i.variantId || "") === (offer.giftVariantId || "")).reduce((sum, i) => sum + i.quantity, 0);
      const stock = Number(variant ? (variant.stock ?? variant.stockLevel) : book.stockLevel) || 0;
      if (stock < inBag + 1) return null;
    }
    const price = catalogUnitPrice(book, variant);
    return Number.isFinite(price) && price >= 0 ? { book, variant, price } : null;
  };
  const autoPick = useMemo(() => pickAutomaticDiscount(autoOffers.filter(offer => !offer.restricted), discountableLines, booksById, offer => giftOffer(offer)?.price ?? NaN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoOffers, discountableLines, booksById, cart]);
  const roundCents = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
  const codeDiscountAmount = useMemo(() => {
    if (!appliedDiscount) return 0;
    try {
      return roundCents(discountAmountFor(appliedDiscount, discountableLines, booksById, { giftPrice: giftOffer(appliedDiscount)?.price }));
    } catch {
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedDiscount, discountableLines, booksById]);
  // The discount that will be charged: the shopper's code, else the best automatic offer.
  const activeDiscount = appliedDiscount || autoPick?.discount || null;
  const discountAmount = appliedDiscount ? codeDiscountAmount : roundCents(autoPick?.amount || 0);
  const autoBeatsCode = Boolean(appliedDiscount && autoPick && !autoPick.freeShipping && roundCents(autoPick.amount) > codeDiscountAmount);
  const freeGift = useMemo(() => {
    if (activeDiscount?.type !== "gift") return null;
    const found = giftOffer(activeDiscount);
    return found ? { id: found.book.id, variantId: found.variant?.id, title: found.book.title || "", variantName: found.variant?.name, price: found.price, photoUrl: found.variant?.photoUrl || smallPhotoUrl(found.book.photos?.[0]) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDiscount, booksMap, cart]);
  const freeGiftPrice = freeGift?.price || 0;
  {
    const giftItem = freeGift && catalogFulfillmentItems([{ id: freeGift.id, variantId: freeGift.variantId, price: freeGift.price, quantity: 1 }], booksMap)?.[0];
    const giftBook = freeGift ? booksMap.get(freeGift.id) : null;
    const giftVariant = freeGift?.variantId ? (giftBook?.variants || []).find((v: any) => v.id === freeGift.variantId) : null;
    freeGiftRef.current = giftItem?.physical ? { id: freeGift!.id, variantId: freeGift!.variantId, price: freeGift!.price, quantity: 1, shippingProfileId: giftBook?.shippingProfileId || null, weightGrams: parseWeightGrams(giftVariant?.weight) ?? parseWeightGrams(giftBook?.weight) } : null;
  }
  // Lines that are taxed and shipped like the server's: gift cards out, the free gift in.
  const taxLines = useMemo(() => {
    if (!catalogItems) return null;
    const own = catalogItems.filter(item => !isGiftCardProduct(booksMap.get(item.id)));
    const gift = freeGift ? catalogFulfillmentItems([{ id: freeGift.id, variantId: freeGift.variantId, price: freeGift.price, quantity: 1, promoGift: true }], booksMap) : [];
    return [...own, ...(gift || [])];
  }, [catalogItems, freeGift, booksMap]);

  // "Add CA$X more for free shipping" — only when the real shipping rules would
  // actually make this delivery free at that total (checked with the same engine).
  const freeShipNudge = useMemo(() => {
    if (checkoutDesign.hideCheckoutFreeShipNudge || cart.length === 0 || shippingProfiles.length === 0) return null;
    const selected = availableRates.find(r => r.id === fulfillmentSelection.optionId || r.name === fulfillmentSelection.optionId);
    if (fulfillmentSelection.method !== "shipping" || !selected || selected.price === 0) return null;
    const candidates = new Set<number>();
    shippingProfiles.forEach((p: any) => {
      if (Number(p.freeShippingOver) > 0) candidates.add(Number(p.freeShippingOver));
      (p.zones || []).forEach((z: any) => (z.rates || []).forEach((r: any) => { if (Number(r.freeOver) > 0) candidates.add(Number(r.freeOver)); }));
    });
    const country = customer.address.country || "Canada";
    const base = shippingItemsForCart();
    for (const t of [...candidates].filter(t => t > cartTotal).sort((a, b) => a - b).slice(0, 6)) {
      const gap = freeShippingGap(cartTotal, t);
      if (!gap) continue;
      const probe = [...base, { price: gap, quantity: 1, shippingProfileId: cart[0]?.shippingProfileId || null, weightGrams: 0 }];
      const quotes = quoteShipping(probe, { country }, shippingProfiles);
      const same = quotes.find(q => q.name === selected.name);
      if ((same ? same.price : quotes[0]?.price) === 0) return { gap, threshold: t };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, cartTotal, shippingProfiles, availableRates, fulfillmentSelection, customer.address.country, checkoutDesign.hideCheckoutFreeShipNudge]);

  const calculateStaticProfileRates = () => {
    if (cart.length === 0 || shippingProfiles.length === 0) {
      setAvailableRates([]);
      return;
    }
    // Same engine the server uses to charge the order (parity-tested); weights
    // come from the catalog so weight-based rates quote identically.
    const items = shippingItemsForCart();
    const physical = catalogItems?.filter(item => item.physical) || [];
    const physicalIds = new Set(physical.map(item => `${item.id}:${item.variantId || ""}`));
    const shippableItems = items.filter((item, index) => physicalIds.has(`${cart[index].id}:${cart[index].variantId || ""}`));
    // A physical free gift travels in the parcel too (the server weighs it the same way).
    if (freeGiftRef.current) shippableItems.push(freeGiftRef.current);
    const quotes = quoteShipping(shippableItems, { country: customer.address.country || "Canada" }, shippingProfiles).filter(q => q.type !== "pickup");
    setAvailableRates(quotes.map((q) => ({ id: q.id, name: q.name, price: q.price, deliveryDays: q.deliveryDays })));
  };

  useEffect(() => {
    const addr = customer.address;
    // The backend decides whether this destination is opted into live rates.
    // Countries outside that allowlist return no live rates and follow the
    // regular profile/zone path below.
    // E-books only: nothing to ship, so no carrier quote (the server charges $0 too).
    if (catalogItems && !catalogItems.some(item => item.physical)) {
      setAvailableRates([]);
      return;
    }
    // Same address boxes as Pay needs (no state outside Canada/US): the server prices live rates for
    // any such address, so profile rates shown for it would be refused at Pay.
    if (!liveRatesAddressReady(addr) || cart.length === 0) {
      calculateStaticProfileRates();
      return;
    }
    // Pay waits from now, not only once the request starts after the pause below: a rate picked
    // during that pause would be a stale or profile rate the server refuses.
    setShippoRatesLoading(true);

    // Only the newest request may change the quotes or the loading state: an older answer for a
    // previous address is dropped, and a carrier that never answers is given up on.
    const ticket = ratesGuard.current.next();
    const request = signalWithTimeout(RATES_TIMEOUT_MS);
    const delayDebounce = setTimeout(async () => {
      setShippoRatesLoading(true);
      try {
        const res = await functionFetch("getShippoRates", {
          signal: request.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: {
              street: addr.street.trim(),
              unit: addr.unit.trim(),
              city: addr.city.trim(),
              state: addr.state.trim(),
              zip: addr.zip.trim(),
              country: addr.country || "Canada",
              name: customer.name || "Customer"
            },
            // Only the books that travel: e-books add no parcel weight.
            items: [...cart
              .filter(i => !catalogItems || catalogItems.some(item => item.physical && item.id === i.id && (item.variantId || "") === (i.variantId || "")))
              .map(i => ({ id: i.id, quantity: i.quantity, variantId: i.variantId })),
              ...(freeGiftRef.current ? [{ id: freeGiftRef.current.id, quantity: 1, variantId: freeGiftRef.current.variantId }] : [])]
          })
        });

        if (!ratesGuard.current.isCurrent(ticket)) return;
        if (res.ok) {
          const data = await res.json();
          if (!ratesGuard.current.isCurrent(ticket)) return;
          const liveRates = Array.isArray(data.rates) ? liveCheckoutRates(data.rates) : [];
          if (liveRates.length > 0) {
            setAvailableRates(liveRates.map((rate: any) => ({ ...rate, id: rate.name })));
            setShippoRatesLoading(false);
            return;
          }
        }
      } catch (err) {
        if (!ratesGuard.current.isCurrent(ticket)) return;
        console.error("Failed to fetch Shippo rates:", err);
      } finally {
        request.done();
        if (ratesGuard.current.isCurrent(ticket)) setShippoRatesLoading(false);
      }

      // Fallback (also after a timeout): the shop's own profile rates.
      if (ratesGuard.current.isCurrent(ticket)) calculateStaticProfileRates();
    }, 1500);

    return () => {
      clearTimeout(delayDebounce);
      request.done();
      ratesGuard.current.invalidate();
      request.abort();
      setShippoRatesLoading(false);
    };
  }, [customer.address.street, customer.address.unit, customer.address.city, customer.address.state, customer.address.zip, customer.address.country, cart, shippingProfiles, cartTotal, catalogItems, freeGift?.id, ratesRefresh]);


  useEffect(() => {
    if (fulfillmentSelection.method === "shipping" && fulfillmentSelection.optionId
      && !availableRates.some(rate => rate.id === fulfillmentSelection.optionId || rate.name === fulfillmentSelection.optionId)) {
      setFulfillmentSelection(current => ({ ...current, optionId: "" }));
    }
  }, [availableRates, fulfillmentSelection]);

  // Re-validate discount whenever email or cart changes
  useEffect(() => {
    if (appliedDiscount && books.length > 0) {
      try {
        validateDiscountRestrictions(appliedDiscount, customer.email, discountableLines, booksMap, discountableCount, discountableTotal);
      } catch (err: any) {
        setAppliedDiscount(null);
        setDiscountError(copyErrorText(err, checkoutDesign, "coDiscountInvalid"));
      }
    }
  }, [customer.email, cart, books, appliedDiscount]);
 

  const physicalItems = useMemo(() => taxLines?.filter(item => item.physical) || [], [taxLines]);
  // Pre-ordered printed books hold the parcel until the latest release (src/shared/preorder.ts).
  const preorderShip = useMemo(() => bagPreorder(cart.filter(i => !catalogItems || catalogItems.some(ci => ci.id === i.id && (ci.variantId || "") === (i.variantId || "") && ci.physical))), [cart, catalogItems]);
  // Known to be e-books only (not just "catalog still loading").
  const digitalOnly = Boolean(catalogItems && catalogItems.length && !physicalItems.length);
  const availableFulfillmentMethods = useMemo<FulfillmentSelection["method"][]>(() => {
    if (!physicalItems.length) return [];
    const methods: FulfillmentSelection["method"][] = ["shipping"];
    if (settings?.localFulfillment?.enabled && settings.localFulfillment.pickupLocations?.some((location: any) => location.enabled)) methods.push("pickup");
    if (settings?.localFulfillment?.enabled && settings.localFulfillment.deliveryZones?.some((zone: any) => zone.enabled)) methods.push("local_delivery");
    return methods;
  }, [physicalItems.length, settings?.localFulfillment]);
  // A pickup limited to an area (e.g. Toronto, "M") needs the shopper's address to check eligibility.
  const pickupNeedsAddress = !!settings?.localFulfillment?.pickupLocations?.some((location: any) => location.enabled && Array.isArray(location.postalPrefixes) && location.postalPrefixes.length);
  const physicalSubtotalAfterDiscount = useMemo(() => taxLines
    ? discountedPhysicalSubtotal(taxLines, discountAmount, activeDiscount, booksMap)
    : 0, [taxLines, discountAmount, activeDiscount, booksMap]);
  const localQuotes = useMemo(() => catalogItems && physicalItems.length
    ? quoteLocalFulfillment(settings?.localFulfillment, customer.address, physicalSubtotalAfterDiscount, physicalItems)
    : [], [catalogItems, physicalItems, settings?.localFulfillment, customer.address, physicalSubtotalAfterDiscount]);

  // A changed cart, address, discount, or service configuration invalidates a
  // previously chosen price. Keep the intended method so the shopper can review it.
  const quoteContext = JSON.stringify([
    cart.map(item => [item.id, item.variantId, item.quantity, item.price]),
    fulfillmentSelection.method === "pickup" ? null : [customer.address.street, customer.address.unit, customer.address.city, customer.address.state, customer.address.zip, customer.address.country],
    discountAmount,
    settings?.localFulfillment,
  ]);
  // Remembered with the method it was computed for: switching between pickup and shipping is
  // the shopper making a choice, not a price change, so it must not clear the option just picked.
  const previousQuoteContext = useRef<{ method: string; context: string } | null>(null);
  useEffect(() => {
    const prev = previousQuoteContext.current;
    if (prev && prev.method === fulfillmentSelection.method && prev.context !== quoteContext && fulfillmentSelection.optionId) {
      setFulfillmentSelection(current => ({ ...current, optionId: "" }));
    }
    previousQuoteContext.current = { method: fulfillmentSelection.method, context: quoteContext };
  }, [quoteContext, fulfillmentSelection.method]);

  // Until the shopper picks a rate themselves, keep the best current quote
  // selected (typing the address replaces the quotes and clears the old pick).
  // Once they choose, a later address or cart change leaves the selection empty
  // so a different price is never swapped in behind their explicit choice.
  const shopperChoseShipping = useRef(false);
  const selectFulfillment = (value: FulfillmentSelection) => {
    // Only a picked shipping rate counts; switching tabs (e.g. to local delivery) is not a choice.
    if (value.method === "shipping" && value.optionId) shopperChoseShipping.current = true;
    setFulfillmentSelection(value);
  };
  useEffect(() => {
    if (availableRates.length && fulfillmentSelection.method === "shipping" && !fulfillmentSelection.optionId && !shopperChoseShipping.current) {
      const cheapest = [...availableRates].sort(bestFirst)[0];
      setFulfillmentSelection(current => ({ ...current, optionId: cheapest.id || cheapest.name }));
    }
  }, [availableRates, fulfillmentSelection]);

  useEffect(() => {
    // Same matching as the server's charge, so the tax shown is the tax paid.
    const rateFor = (address: any) => matchTaxRate(taxRates, address?.country, address?.state);
    const taxable = Math.max(0, cartTotal - giftCardLinesTotal + freeGiftPrice - discountAmount);
    if (fulfillmentSelection.method === "pickup") {
      const pickup = localQuotes.find(quote => quote.id === fulfillmentSelection.optionId && quote.method === "pickup");
      const physicalTaxable = Math.min(taxable, physicalSubtotalAfterDiscount);
      const digitalTaxable = Math.max(0, taxable - physicalTaxable);
      const physicalRate = rateFor(pickup?.address);
      // Area-limited pickup already has the shopper's address, so no separate billing box is shown.
      const digitalRate = rateFor(pickupNeedsAddress && !customer.billingAddress.state ? customer.address : customer.billingAddress);
      setTaxCost(physicalTaxable * (Number(physicalRate?.rate || 0) / 100) + digitalTaxable * (Number(digitalRate?.rate || 0) / 100));
      return;
    }
    const matchedTaxRate = rateFor(customer.address);
    setTaxCost(taxable * (Number(matchedTaxRate?.rate || 0) / 100));
  }, [customer.address.country, customer.address.state, customer.billingAddress.country, customer.billingAddress.state, fulfillmentSelection, localQuotes, physicalSubtotalAfterDiscount, cartTotal, appliedDiscount, taxRates, discountAmount, giftCardLinesTotal, freeGiftPrice]);

  const applyDiscount = async () => {
    // Pasted codes often carry spaces; the server trims too.
    const code = discountCode.trim();
    // Enter in the box bypasses the disabled Apply button: one check at a time.
    if (!code || isApplying) return;
    setIsApplying(true);
    setDiscountError("");
    try {
      // A refused code reads as invalid/expired; a request that never got an answer (offline, 5xx,
      // busy) says the code couldn't be checked, so the shopper isn't told a good code is bad.
      const response = await functionFetch("validateDiscountCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }).catch((err: unknown) => { throw err instanceof AppVerificationError ? err : new CopyError(checkoutDesign, "coDiscountUnavailable"); });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new CopyError(checkoutDesign, response.status >= 500 || response.status === 429 ? "coDiscountUnavailable" : "coDiscountExpired");
      const discount = expandDiscountCategories(data.discount, settings?.design?.categories);
      validateDiscountRestrictions(discount, customer.email, discountableLines, booksMap, discountableCount, discountableTotal);
      setAppliedDiscount(discount);
    } catch (err: any) {
      setDiscountError(copyErrorText(err, checkoutDesign, "coDiscountExpired"));
      setAppliedDiscount(null);
    } finally {
      setIsApplying(false);
    }
  };

  // Checkout's "Gift card" box: checks the balance now; the server re-checks and holds it at payment.
  const applyGiftCard = async () => {
    const code = giftCardInput.trim().toUpperCase();
    if (!code || giftCardApplying) return;
    if (giftCards.length >= 5) { setGiftCardError(c("coGiftCardTooMany")); return; }
    setGiftCardApplying(true);
    setGiftCardError("");
    try {
      const res = await functionFetch("validateDiscountCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "giftCardBalance", code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.balanceMinor !== "number") {
        setGiftCardError(typeof data?.error === "string" && data.error ? data.error : c("coGiftCardInvalid"));
        return;
      }
      setGiftCards(current => current.some(card => card.last4 === data.last4 && card.code.replace(/[^A-Z0-9]/g, "") === code.replace(/[^A-Z0-9]/g, ""))
        ? current : [...current, { code, last4: String(data.last4 || ""), balanceMinor: data.balanceMinor }]);
      setGiftCardInput("");
    } catch {
      setGiftCardError(c("coGiftCardInvalid"));
    } finally {
      setGiftCardApplying(false);
    }
  };

  // A shared discount link (?discount=CODE) fills the box once, then checks it like a typed code;
  // the existing applied/refused messages are all the shopper sees. The server re-checks at payment.
  const sharedCode = useRef<"idle" | "filled" | "done">("idle");
  useEffect(() => {
    if (sharedCode.current !== "idle" || catalogState !== "ready" || !settings || appliedDiscount) return;
    const code = sharedDiscount();
    if (!code) return;
    sharedCode.current = "filled";
    setDiscountCode(code);
  }, [catalogState, settings, appliedDiscount]);
  useEffect(() => {
    if (sharedCode.current !== "filled" || !discountCode || discountCode !== sharedDiscount()) return;
    sharedCode.current = "done";
    clearSharedDiscount();
    void applyDiscount();
  }, [discountCode]);

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    setDiscountError("");
  };



  const isFreeShipping  = appliedDiscount ? appliedDiscount.type === "freeship" : Boolean(autoPick?.freeShipping);
  const selectedShippingQuote = availableRates.find(rate => rate.id === fulfillmentSelection.optionId || rate.name === fulfillmentSelection.optionId);
  const selectedLocalQuote = localQuotes.find(quote => quote.id === fulfillmentSelection.optionId && quote.method === fulfillmentSelection.method);
  const shippingCost = !physicalItems.length ? 0 : fulfillmentSelection.method === "shipping" ? Number(selectedShippingQuote?.price || 0) : Number(selectedLocalQuote?.price || 0);
  const finalShipping   = isFreeShipping ? 0 : shippingCost;
  const itemsSubtotal   = cartTotal + freeGiftPrice;
  const beforeGiftCards = itemsSubtotal - discountAmount + finalShipping + taxCost;
  // Gift cards pay what is left, never other gift cards in the bag (same split as the server).
  const giftCardUse = useMemo(() => {
    let left = Math.max(0, Math.round((beforeGiftCards - giftCardLinesTotal) * 100));
    return giftCards.map(card => {
      const minor = Math.min(left, Math.max(0, card.balanceMinor));
      left -= minor;
      return { ...card, minor };
    });
  }, [giftCards, beforeGiftCards, giftCardLinesTotal]);
  const giftCardAmount = giftCardUse.reduce((sum, card) => sum + card.minor, 0) / 100;
  const finalTotal      = Math.round((beforeGiftCards - giftCardAmount) * 100) / 100;
  // Tax is a real figure (even CA$0.00) once the tax rules are loaded and the address it
  // depends on names a country and, where it has a list, a recognised province/state.
  const taxAddressKnown = (address: any) => {
    const country = String(address?.country || "").trim();
    if (!country) return false;
    const regions = regionsFor(country);
    const state = String(address?.state || "").trim().toLowerCase();
    return !regions || regions.some(([code, name]) => code.toLowerCase() === state || name.toLowerCase() === state);
  };
  // Pickup: books are taxed at the chosen location, so nothing is known until one is picked;
  // any e-books in the bag also need the billing address.
  const pickupQuote = fulfillmentSelection.method === "pickup" ? localQuotes.find(quote => quote.id === fulfillmentSelection.optionId && quote.method === "pickup") : undefined;
  const taxKnown = catalogState === "ready" && (fulfillmentSelection.method === "pickup"
    ? !!pickupQuote && taxAddressKnown(pickupQuote.address) && (physicalSubtotalAfterDiscount >= Math.max(0, cartTotal - discountAmount) || taxAddressKnown(pickupNeedsAddress && !customer.billingAddress.state ? customer.address : customer.billingAddress))
    : taxAddressKnown(customer.address));

  const getActiveShippingDetails = () => {
    if (fulfillmentSelection.method === "pickup" && selectedLocalQuote) return { serviceName: selectedLocalQuote.name };
    if (fulfillmentSelection.method === "local_delivery" && selectedLocalQuote) return { serviceName: selectedLocalQuote.name };
    const current = selectedShippingQuote;
    if (!current) return null;
    return {
      serviceName: current.name,
      deliveryDays: current.deliveryDays
    };
  };

  useSEO({ title: c("seoCheckoutTitle"), description: c("seoCheckoutDescription") });

  // Track funnel + abandoned cart on email entry
  // Google Analytics checkout steps share one shape: the bag's CAD value and its books (CartContext prices are CAD).
  const ga4Bag = () => ({
    currency: "CAD",
    value: Math.round(cartRef.current.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0) * 100) / 100,
    items: ga4Items(cartRef.current),
  });
  const ga4Day = () => new Date().toISOString().slice(0, 10);
  useEffect(() => {
    funnelApi.trackCheckoutStart();
    if (cartRef.current.length) ga4Once(`begin_checkout_${ga4Day()}`, "begin_checkout", ga4Bag());
    if (typeof window !== "undefined" && window.location.search.includes("preview=true")) {
      window.parent.postMessage({ type: "PREVIEW_READY" }, "*");
    }
  }, []);

  useEffect(() => {
    // The cookie banner lists cart reminders under Marketing: a shopper who declined gets none.
    // The Studio preview never saves a cart (its bag may be the display-only sample).
    if (inEditorPreview() || !customer.email || !customer.email.includes("@") || cart.length === 0 || !consentAllows("marketing")) return;
    const t = setTimeout(() => {
      let recoveryCartId = sessionStorage.getItem("fm_checkout_cart_id");
      if (!recoveryCartId) {
        const newRef = doc(collection(db, "abandoned-carts"));
        recoveryCartId = newRef.id;
        sessionStorage.setItem("fm_checkout_cart_id", recoveryCartId);
      }

      abandonedCartApi.upsert(recoveryCartId, {
        email: customer.email,
        items: cart.map(i => ({
          id: i.id,
          variantId: i.variantId || "",
          variantName: i.variantName || "",
          title: i.title,
          price: i.price,
          quantity: i.quantity,
          photoUrl: i.photoUrl || "",
          stripePriceId: i.stripePriceId || "",
          stockLimit: i.stockLimit ?? null,
          shippingProfileId: i.shippingProfileId || ""
        })),
        subtotal: cartTotal,
        customer,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [customer.email, cart, cartTotal]);

  // Fill an empty (or "Please select") state/province from the postal code.
  useEffect(() => {
    const current = cleanRegion(customer.address.state);
    if (current) return;
    const guess = provinceFromPostal(customer.address.country, customer.address.zip);
    if (guess || current !== customer.address.state) {
      setCustomer(prev => ({ ...prev, address: { ...prev.address, state: guess } }));
    }
  }, [customer.address.zip, customer.address.country, customer.address.state]);

  // A server "Discount code error: …" reply means only the code is the problem.
  const discountRejection = (data: any) => {
    const message = typeof data?.error === "string" ? data.error : "";
    if (data?.code === "gift_card_rejected") {
      return Object.assign(new Error(message), { giftCardRejected: true, reason: message.replace(/^Gift card error:\s*/i, "") || c("coGiftCardInvalid") });
    }
    if (data?.code === "nothing_to_charge") return Object.assign(new CopyError(checkoutDesign, "coGiftCardCovers"), { nothingToCharge: true });
    if (!/^Discount code error:/i.test(message)) return null;
    return Object.assign(new Error(message), { discountRejected: true, reason: message.replace(/^Discount code error:\s*/i, "") });
  };

  // A 400 from checkout carries the server's reason (stock, edition, delivery): show it.
  const serverRefusal = (response: Response, data: any) => {
    const message = typeof data?.error === "string" ? data.error.trim() : "";
    // The shopper's earlier attempt already took their money: show that order instead of charging again.
    if (response.status === 409 && data?.code === "previous_attempt_paid" && typeof data.previousOrderId === "string" && data.previousOrderId) {
      return Object.assign(new CopyError(checkoutDesign, "coPreviousPaid"), { previousPaidOrderId: data.previousOrderId as string });
    }
    if (response.status !== 400 && response.status !== 409) return null;
    // The shown rates were profile rates (the browser's carrier request failed or timed out) or old
    // carrier rates: fetch the carrier's rates again and make the shopper pick from them.
    if (shouldRefetchRates(data)) {
      setFulfillmentSelection(current => (current.method === "shipping" ? { ...current, optionId: "" } : current));
      setRatesRefresh(n => n + 1);
    }
    // Per-shopper hold cap (functions/stockHolds.js HOLD_LIMITS): the shop's own words.
    if (data?.code === "hold_limit") return new CopyError(checkoutDesign, "coHoldLimit");
    // Settings › General › Store status › Maintenance: the server refuses every new checkout.
    if (data?.code === "store_closed") return new CopyError(checkoutDesign, "coStoreClosed");
    return message ?new CopyError(checkoutDesign, "coServerRefused", { reason: message }) : null;
  };

  const needsDeliveryAddress = !digitalOnly && (fulfillmentSelection.method !== "pickup" || pickupNeedsAddress);
  // Live: the express wallet waits on it, and Pay lists it field by field.
  const detailProblems = useMemo(() => checkoutDetailProblems({
    name: customer.name, email: customer.email, address: customer.address, digitalOnly, needsDeliveryAddress,
  }), [customer.name, customer.email, customer.address, digitalOnly, needsDeliveryAddress]);
  // Bags the server will refuse at Pay (functions/stockHolds.js caps): say so before the card is typed.
  const holdIssues = useMemo(
    () => (catalogState === "ready" ? holdWarnings(cart, booksMap, holdLimitsFrom(settings)) : []),
    [cart, booksMap, settings?.stockHolds, catalogState],
  );
  // A field's message goes away as soon as it is fixed.
  useEffect(() => {
    setFieldErrors(prev => {
      const keys = Object.keys(prev) as DetailField[];
      if (!keys.length) return prev;
      const open = new Set(detailProblems.map(problem => problem.field));
      const kept = keys.filter(key => open.has(key));
      return kept.length === keys.length ? prev : Object.fromEntries(kept.map(key => [key, prev[key]]));
    });
  }, [detailProblems]);

  // Overview › Marketing & traffic › "Where checkout loses people": how far each shopper got (once per step and session).
  const emailTyped = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email || "").trim());
  // Only once the address is complete: before that the rates are a placeholder estimate every shopper "sees".
  const deliveryPriceShown = cart.length > 0 && detailProblems.length === 0 && (digitalOnly || availableRates.length > 0 || localQuotes.length > 0);
  useEffect(() => { if (cart.length > 0 && emailTyped) void funnelApi.trackCheckoutStep("email"); }, [emailTyped, cart.length]);
  useEffect(() => { if (cart.length > 0 && detailProblems.length === 0) void funnelApi.trackCheckoutStep("address"); }, [detailProblems.length, cart.length]);
  useEffect(() => { if (deliveryPriceShown) void funnelApi.trackCheckoutStep("delivery"); }, [deliveryPriceShown]);
  // Google Analytics "add_shipping_info": the address is complete and a way to get the books is picked (once a day).
  useEffect(() => {
    if (!deliveryPriceShown || !cartRef.current.length || (!digitalOnly && !fulfillmentSelection.optionId)) return;
    ga4Once(`add_shipping_info_${ga4Day()}`, "add_shipping_info", { ...ga4Bag(), shipping_tier: digitalOnly ? "digital" : fulfillmentSelection.method });
  }, [deliveryPriceShown, digitalOnly, fulfillmentSelection.optionId, fulfillmentSelection.method]);

  const completePurchase = async () => {
    void funnelApi.trackCheckoutStep("pay");
    if (cartRef.current.length) ga4Once(`add_payment_info_${ga4Day()}`, "add_payment_info", { ...ga4Bag(), payment_type: String(selectedPaymentMethod || "").slice(0, 40) });
    if (catalogState !== "ready") {
      setNotice({ tone: "error", text: c(catalogState === "failed" ? "coCatalogFailed" : "coCatalogLoading") });
      return;
    }
    if (finalTotal > 0 && !selectedPaymentMethod.startsWith("manual_") && convertPrice(finalTotal) < MIN_CARD_CHARGE) {
      setNotice({ tone: "error", text: c("coBelowMinimum", { amount: amountIn(MIN_CARD_CHARGE, currency) }) });
      return;
    }
    if (selectedPaymentMethod === "stripe" && !stripeRoute.canPay && finalTotal > 0) {
      setNotice({ tone: "error", text: c("coStripeLoadError") });
      return;
    }
    const validBilling = fulfillmentSelection.method !== "pickup" || pickupNeedsAddress || [customer.billingAddress.country, customer.billingAddress.state].every(value => String(value || "").trim());
    const selectedOptionExists = !physicalItems.length || (fulfillmentSelection.method === "shipping"
      ? availableRates.some(rate => rate.id === fulfillmentSelection.optionId || rate.name === fulfillmentSelection.optionId)
      : localQuotes.some(quote => quote.id === fulfillmentSelection.optionId && quote.method === fulfillmentSelection.method));
    // Name every field that needs fixing next to its box, then move to the first (a mistyped
    // email means no confirmation and no e-book link).
    if (detailProblems.length) {
      void funnelApi.trackCheckoutStep("fields");
      setFieldErrors(Object.fromEntries(detailProblems.map(problem => [problem.field, c(problem.copyKey)])));
      setNotice({ tone: "error", text: c("coErrShippingFields") });
      const first = detailProblems[0].field;
      setTimeout(() => document.getElementById(detailInputId(first))?.focus(), 0);
      return;
    }
    setFieldErrors({});
    if (termsRequired && !termsAccepted) {
      setTermsError(true);
      setNotice({ tone: "error", text: c("coErrTerms") });
      setTimeout(() => document.getElementById("checkout-terms")?.focus(), 0);
      return;
    }
    if (!validBilling) {
      setNotice({ tone: "error", text: c("coErrPickupBillingFields") });
      return;
    }
    if (!selectedOptionExists) {
      setNotice({ tone: "error", text: c("coFulfillmentReview") });
      return;
    }
    setNotice(null);
    const payingByCardForm = useCardForm && selectedPaymentMethod === "stripe" && finalTotal > 0;
    if (payingByCardForm) {
      const cardError = (await cardFormRef.current?.validate()) ?? (cardFormRef.current ? null : c("coStripeLoadError"));
      if (cardError) {
        setNotice({ tone: "error", text: cardError });
        return;
      }
    }
    try {
      // Carrier address verification applies to shipped orders. Pickup has no
      // shipping address, and local delivery uses its configured postal zone.
      let addressVerified = fulfillmentSelection.method !== "shipping" || digitalOnly;
      let addressError = "";
      const valResponse = fulfillmentSelection.method === "shipping" && !digitalOnly ? await functionFetch("validateAddress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            name: customer.name,
            street: customer.address.street,
            unit: customer.address.unit,
            city: customer.address.city,
            state: customer.address.state,
            zip: customer.address.zip,
            country: customer.address.country
          }
        })
      }).catch(() => null) : null;
      if (fulfillmentSelection.method === "shipping" && !digitalOnly && (!valResponse || !valResponse.ok)) {
        // The address checker is down or busy: take the order and flag the address for the
        // shop to confirm, rather than turning the shopper away.
        addressVerified = false;
        addressError = "verification_unavailable";
      } else if (valResponse) {
        const valData = await valResponse.json();
        // If verification is temporarily unavailable, publisher review remains required.
        addressVerified = valData.isValid === true && valData.unverified !== true;
        addressError = addressVerified ? "" : (valData.messages || []).map((m: any) => m.text).join(", ").slice(0, 2000);
      }

      const isManual = selectedPaymentMethod.startsWith("manual_");
      let manualMethod = null;
      if (isManual) {
        const manualId = selectedPaymentMethod.replace("manual_", "");
        manualMethod = (settings?.payments?.manualMethods || []).find((m: any) => m.id === manualId);
      }

      const referralSource = typeof window !== "undefined" ? window.sessionStorage.getItem("referral_source") : null;
      // Campaign tags, referring page and landing page (lib/visitSource.ts); null when nothing was recorded.
      const acquisition = orderAcquisition();

      const checkoutCartId = sessionStorage.getItem("fm_checkout_cart_id");
      const orderData = {
        // Lowercased so Account › My orders (matched on the sign-in email) finds it.
        customer: { ...customer, email: String(customer.email || "").trim().toLowerCase() },
        // Lets the server stop the abandoned-cart email once this order is paid.
        ...(checkoutCartId ? { cartId: checkoutCartId } : {}),
        customerId: currentUser?.uid || null,
        referralSource: (referralSource || "direct").slice(0, 200),
        ...(acquisition ? { acquisition } : {}),
        ...(orderNoteBoxOn(checkoutDesign) && orderNote.trim() ? { orderNote: orderNote.trim().slice(0, 500) } : {}),
        addressVerified,
        addressError,
        items: cart.map(item => ({
          id: item.id,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          title: item.title,
          price: item.price,
          quantity: item.quantity,
          photoUrl: item.photoUrl,
          stripePriceId: item.stripePriceId || null,
          shippingProfileId: item.shippingProfileId || null,
          // The server re-prices extras from the catalog; only their ids and wording are used.
          ...(item.addOns?.length ? { addOns: item.addOns.map(addOn => ({ id: addOn.id, ...(addOn.text ? { text: addOn.text } : {}) })) } : {}),
          ...(item.giftCardDetails ? { giftCardDetails: item.giftCardDetails } : {}),
        })),
        ...(giftCards.length ? { giftCards: giftCards.map(card => ({ code: card.code })) } : {}),
        subtotal: itemsSubtotal,
        discount: discountAmount,
        shipping: finalShipping,
        shippingMethod: fulfillmentSelection.method === "shipping" ? (selectedShippingQuote?.name || null) : null,
        ...(physicalItems.length ? { fulfillmentSelection } : {}),
        tax: taxCost,
        total: finalTotal,
        status: "pending_payment",
        paymentStatus: "unpaid",
        // Manual-payment orders never use this: the server builds them (createManualLocalOrder).
        paymentMethod: selectedPaymentMethod === "paypal" ? "PayPal" : "Stripe",
        paymentInstructions: "",
        testMode: settings?.payments?.testMode || false,
        appliedDiscount: appliedDiscount
          ? { id: appliedDiscount.id, code: appliedDiscount.code, type: appliedDiscount.type, value: appliedDiscount.value }
          : null,
        metadata: { userAgent: navigator.userAgent, platform: "web" }
      };
      
      // Save customer email in localStorage to recover cart on payment success landing
      localStorage.setItem("last_customer_email", customer.email);
      
      // The code is part of the key: removing a refused code must make a fresh order, even when the total is unchanged.
      const cardKey = cardAttemptKey({ items: orderData.items, total: orderData.total, customer: orderData.customer, currency, fulfillmentSelection, discountCode: orderData.appliedDiscount?.code || null, giftCardCodes: giftCards.map(card => card.code), orderNote: (orderData as any).orderNote, addressVerified });
      // Same bag = same order; its PaymentIntent only while the server's holds are still alive.
      const reuse = payingByCardForm ? reusableCardOrder(pendingCardOrder.current, cardKey) : null;
      let orderId: string;

      // Gift cards are taken when the payment is confirmed: a manual payment (days later) can't use them.
      if (isManual && giftCards.length && finalTotal > 0) {
        setNotice({ tone: "error", text: c("coGiftCardManual") });
        return;
      }

      // A $0 order (100% discount, free e-book) has nothing to charge: the server prices it
      // and completes it only when its own total is zero.
      // The server said gift cards (or an offer only it could see) cover everything: complete without a card.
      if (finalTotal === 0 || serverSaysFree.current) {
        serverSaysFree.current = false;
        const freeOrderId = await adminApi.createOrder({ ...orderData, paymentMethod: "Free" });
        const response = await functionFetch("createStripeCheckoutSession", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "completeFreeOrder", orderId: freeOrderId, previousOrderId: previousAttempt(), currency: currency.toLowerCase() }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw discountRejection(result) || serverRefusal(response, result) || new CopyError(checkoutDesign, "coFreeOrderError");
        purchaseNavigating.current = true;
        window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}checkout?success=true&order_id=${encodeURIComponent(freeOrderId)}`;
        return;
      }

      // Every manual-payment order is created by Functions from a whitelisted draft
      // and the current server catalog/config. No client totals can reach it.
      if (isManual) {
        const response = await functionFetch("createStripeCheckoutSession", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createManualLocalOrder",
            manualMethodId: manualMethod?.id,
            previousOrderId: previousAttempt(),
            currency: currency.toLowerCase(),
            orderDraft: {
              customer,
              items: cart.map(item => ({ id: item.id, variantId: item.variantId || null, quantity: item.quantity,
                ...(item.addOns?.length ? { addOns: item.addOns.map(addOn => ({ id: addOn.id, ...(addOn.text ? { text: addOn.text } : {}) })) } : {}),
                ...(item.giftCardDetails ? { giftCardDetails: item.giftCardDetails } : {}) })),
              ...(physicalItems.length ? { fulfillmentSelection } : {}),
              ...(orderData.shippingMethod ? { shippingMethod: orderData.shippingMethod } : {}),
              ...(checkoutCartId ? { cartId: checkoutCartId } : {}),
              referralSource: orderData.referralSource,
              ...(acquisition ? { acquisition } : {}),
              ...(appliedDiscount?.code ? { appliedDiscount: { code: appliedDiscount.code } } : {}),
              ...(orderNoteBoxOn(checkoutDesign) && orderNote.trim() ? { orderNote: orderNote.trim().slice(0, 500) } : {}),
            },
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.orderId) throw discountRejection(result) || serverRefusal(response, result) || new CopyError(checkoutDesign, "coManualOrderError");
        orderId = result.orderId;
        if (result.trackingKey) rememberOrderAccess(orderId, result.trackingKey);
      } else {
        orderId = reuse ? reuse.orderId : await adminApi.createOrder(orderData);
      }
      // The order this attempt replaces (named once, below), then this one for the next retry.
      const supersededOrderId = previousAttempt();
      rememberAttempt(orderId);

      if (isManual) {
        purchaseNavigating.current = true;
        window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}checkout?success=true&order_id=${orderId}&manual=true`;
        return;
      }

      if (selectedPaymentMethod === "paypal") {
        const returnUrl = `${window.location.origin}${import.meta.env.BASE_URL}checkout`;
        const paypalResponse = await functionFetch("createPayPalOrder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, currency: currency.toLowerCase(), returnUrl, previousOrderId: supersededOrderId }),
        });
        const paypalData = await paypalResponse.json();
        if (!paypalResponse.ok) throw discountRejection(paypalData) || serverRefusal(paypalResponse, paypalData) || new CopyError(checkoutDesign, "coPaypalError");
        if (!paypalData.approvalUrl) throw new CopyError(checkoutDesign, "coErrPaypalUrl");
        // Same safeguard as the card form: if the server priced the order differently from the total on
        // screen (live catalog or exchange rate moved), say so before PayPal shows another amount.
        // Pressing PayPal again with that same amount confirms it.
        const paypalMinor = Number(paypalData.amount);
        if (Number.isFinite(paypalMinor) && paypalMinor > 0) {
          const paypalCurrency = String(paypalData.currency || currency).toLowerCase();
          const seen = paypalConfirmedAmount.current;
          const shownMinor = Math.round(convertPrice(finalTotal) * 100);
          if (totalNeedsConfirming(paypalMinor, shownMinor, paypalCurrency) && !(seen && seen.amount === paypalMinor && seen.currency === paypalCurrency)) {
            paypalConfirmedAmount.current = { amount: paypalMinor, currency: paypalCurrency };
            setNotice({ tone: "error", text: c("coTotalChanged", { amount: amountIn(paypalMinor / 100, paypalCurrency) }) });
            return;
          }
        }
        purchaseNavigating.current = true;
        window.location.href = paypalData.approvalUrl;
        return;
      }

      // Tell the backend exactly where this checkout page lives. On GitHub
      // Pages the site sits under a sub-path, so origin alone is not enough
      // for Stripe's success/cancel redirects.
      const returnUrl = `${window.location.origin}${import.meta.env.BASE_URL}checkout`;

      const successUrl = `${returnUrl}?success=true&order_id=${encodeURIComponent(orderId)}`;

      if (payingByCardForm) {
        // Lock recovery before requesting an intent: even a lost response may
        // have created a payment. Do not offer a competing hosted route.
        setInlineAttemptStarted(true);
        let clientSecret = reuse?.clientSecret || "";
        let intentAmount = reuse?.clientSecret ? reuse.amount : undefined;
        let intentCurrency = reuse?.clientSecret ? reuse.currency : undefined;
        // Remember the order before asking for a payment, so a retry reuses it instead of
        // leaving another unpaid order behind.
        pendingCardOrder.current = reuse?.clientSecret ? reuse : { key: cardKey, orderId, clientSecret: "", createdAt: Date.now() };
        // A reused order whose PaymentIntent has aged out may already be paid (a confirm whose answer never
        // reached this tab). Ask before creating another payment, and open the order if it went through.
        if (!clientSecret && reuse) {
          const statusRes = await functionFetch("createStripeCheckoutSession", {
            method: "POST",
            headers: await orderAccessHeaders(orderId),
            body: JSON.stringify({ action: "status", orderId }),
          }).catch(() => null);
          const statusData = statusRes && statusRes.ok ? await statusRes.json().catch(() => null) : null;
          if (paymentSettled(statusData?.status)) {
            pendingCardOrder.current = null;
            purchaseNavigating.current = true;
            window.location.href = successUrl;
            return;
          }
        }
        if (!clientSecret) {
          const intentResponse = await functionFetch("createStripeCheckoutSession", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, currency: currency.toLowerCase(), returnUrl, paymentElement: true, previousOrderId: supersededOrderId }),
          });
          const intentData = await intentResponse.json();
          if (!intentResponse.ok || !intentData.clientSecret) {
            // Nothing was created, so the card form may be reloaded or retried.
            setInlineAttemptStarted(false);
            throw discountRejection(intentData) || serverRefusal(intentResponse, intentData) || new CopyError(checkoutDesign, "coStripeError");
          }
          const madeAttempt: PendingCardOrder = { key: cardKey, orderId, clientSecret: intentData.clientSecret, createdAt: Date.now(), amount: Number(intentData.amount), currency: String(intentData.currency || currency).toLowerCase() };
          // The server prices from the live catalog. If that differs from the total on screen,
          // stop before charging so the shopper confirms the real amount.
          // Small gaps are rounding (the server rounds per line) or today's exchange rate; only a real
          // difference stops here. The order and payment are kept, so pressing Pay again confirms the
          // amount shown in the message instead of starting over.
          const shownMinor = Math.round(convertPrice(finalTotal) * 100);
          if (totalNeedsConfirming(Number(intentData.amount), shownMinor, String(intentData.currency || currency))) {
            pendingCardOrder.current = madeAttempt;
            setInlineAttemptStarted(false);
            setNotice({ tone: "error", text: c("coTotalChanged", { amount: amountIn(Number(intentData.amount) / 100, intentData.currency) }) });
            return;
          }
          // The shop switched test/live mode after this page loaded: the card form's key
          // can't confirm the server's payment. Stop before charging; a reload fixes it.
          const formMode = /^pk_live_/.test(String(stripePublicKey || "")) ? "live" : /^pk_test_/.test(String(stripePublicKey || "")) ? "test" : null;
          if (intentData.stripeMode && formMode && intentData.stripeMode !== formMode) throw new CopyError(checkoutDesign, "coStripeError");
          clientSecret = intentData.clientSecret;
          intentAmount = madeAttempt.amount;
          intentCurrency = madeAttempt.currency;
          pendingCardOrder.current = madeAttempt;
        }
        // Stripe confirms only when the card form's amount is exactly the PaymentIntent's (the
        // server rounds per line, so the screen total can be a few cents off).
        if (Number(intentAmount) > 0) cardFormRef.current!.setAmount(Number(intentAmount), intentCurrency || currency);
        const result = await cardFormRef.current!.confirm(clientSecret, successUrl);
        if (result.error) {
          cardFormRef.current?.releaseAmount();
          // A reused payment that fails for a reason other than the card (already paid in another
          // tab, a lost connection) may have gone through: ask the server before inviting another try.
          if (reuse?.clientSecret && mayHaveGoneThrough(result.errorType)) {
            const statusRes = await functionFetch("createStripeCheckoutSession", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "status", orderId, paymentIntentId: intentIdOf(clientSecret) }),
            }).catch(() => null);
            const statusData = statusRes && statusRes.ok ? await statusRes.json().catch(() => null) : null;
            if (paymentSettled(statusData?.status)) {
              pendingCardOrder.current = null;
              purchaseNavigating.current = true;
              window.location.href = `${successUrl}&payment_intent=${encodeURIComponent(intentIdOf(clientSecret))}`;
              return;
            }
          }
          // Not confirmed: the kept order/intent is reused by the next Pay, so a failed form may be reloaded.
          setInlineAttemptStarted(false);
          void funnelApi.trackCheckoutStep("declined");
          setNotice({ tone: "error", text: result.error });
          return;
        }
        pendingCardOrder.current = null;
        purchaseNavigating.current = true;
        window.location.href = `${successUrl}&payment_intent=${encodeURIComponent(result.paymentIntentId || "")}`;
        return;
      }

    } catch (err: any) {
      // No payment was confirmed on this path (pendingCardOrder still remembers the order for the retry),
      // so "Reload payment form" may be offered again if the card form fails.
      setInlineAttemptStarted(false);
      if (err?.previousPaidOrderId) {
        // Never charge twice: open the earlier, paid order's confirmation instead.
        pendingCardOrder.current = null;
        purchaseNavigating.current = true;
        window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}checkout?success=true&order_id=${encodeURIComponent(err.previousPaidOrderId)}&previous_paid=true`;
        return;
      }
      if (err?.nothingToCharge) {
        // Pressing Pay again places the order with nothing to charge (the server checks its own total).
        serverSaysFree.current = true;
        setNotice({ tone: "info", text: c("coGiftCardCovers") });
        return;
      }
      if (err?.giftCardRejected) {
        // The server refused a gift card (used up, disabled…): take the cards off so the shopper can retry.
        setGiftCards([]);
        setGiftCardOpen(true);
        setGiftCardError(err.reason);
        setNotice({ tone: "error", text: c("coGiftCardRejected", { reason: err.reason }) });
        return;
      }
      if (err?.discountRejected) {
        // The server refused the code (expired, already used, wrong email…): take it off
        // so the next attempt can go through, and say why next to the code box.
        setAppliedDiscount(null);
        setDiscountOpen(true);
        setDiscountError(err.reason);
        setNotice({ tone: "error", text: c("coDiscountRejected", { reason: err.reason }) });
        return;
      }
      void funnelApi.trackCheckoutStep("failed");
      setNotice({ tone: "error", text: c("coCheckoutFailed", { error: copyErrorText(err, checkoutDesign, "coStripeError") }) });
    }
  };

  // The Studio preview runs the real checkout: never create an order or a payment from it.
  const handleCompletePurchase = () => (typeof window !== "undefined" && window.location.search.includes("preview=true"))
    ? setNotice({ tone: "info", text: c("coPreviewNoPay") })
    : submitPurchase.current(async () => {
    dispatchFlow({ type: "pay" });
    try {
      await completePurchase();
      return purchaseNavigating.current;
    } finally {
      dispatchFlow({ type: "payEnded", leaving: purchaseNavigating.current });
    }
  });

  // Browser Back from PayPal restores this page (state intact) with Pay still locked for the
  // navigation that never finished: unlock it.
  useEffect(() => onPageRestored(window, () => {
    purchaseNavigating.current = false;
    submitPurchase.current.reset();
    dispatchFlow({ type: "restored" });
  }), []);

  useEffect(() => {
    const landing = readReturn(window.location.search, window.location.pathname);
    if (!landing.landing) {
      if (landing.canceled) setNotice({ tone: "info", text: c("coPaymentCanceled") });
      return;
    }

    let cancelled = false;
    const { orderId: oid, stripeSessionId, stripeIntentId, settledUrl, paypal: isPayPalReturn, manual: isManualReturn, previousPaid: isPreviousPaid } = landing;
    // Drop the one-time return flags so a refresh doesn't replay this landing. A PayPal return keeps its token in the
    // URL until the capture has run, so a refresh mid-capture retries it instead of losing the payment.
    if (!isPayPalReturn) window.history.replaceState(null, "", settledUrl);
    dispatchFlow({ type: "landed", orderId: oid, manual: isManualReturn, previousPaid: isPreviousPaid });

    // Orders aren't publicly readable: the server returns this one for the email it was placed with.
    const lookupEmail = (() => { try { return localStorage.getItem("last_customer_email") || ""; } catch { return ""; } })();
    (async () => {
      try {
        if (isManualReturn) {
          const order: any = await adminApi.getPublicOrder(oid, { email: lookupEmail }).catch(() => null);
          if (cancelled) return;
          if (order) setSuccessOrder(order);
          clearCart();
          forgetAttempt(oid);
          const email = order?.customer?.email || localStorage.getItem("last_customer_email") || "";
          const recoveryCartId = sessionStorage.getItem("fm_checkout_cart_id") || `active_${email.toLowerCase()}`;
          abandonedCartApi.markRecovered(recoveryCartId);
          sessionStorage.removeItem("fm_checkout_cart_id");
          return;
        }
        if (stripeSessionId.startsWith("cs_") || stripeIntentId.startsWith("pi_")) {
          // Ask Stripe whether this session was actually completed. "open" means
          // the shopper came back without paying — send them back to the form.
          const statusRes = await functionFetch("createStripeCheckoutSession", {
            method: "POST",
            headers: await orderAccessHeaders(oid),
            body: JSON.stringify({ action: "status", orderId: oid, sessionId: stripeSessionId, paymentIntentId: stripeIntentId }),
          }).catch(() => null);
          const statusData = statusRes && statusRes.ok ? await statusRes.json() : null;
          if (cancelled) return;
          dispatchFlow({ type: "stripeStatus", status: statusData?.status });
          if (statusData?.status === "open" || statusData?.status === "expired") {
            window.history.replaceState(null, "", window.location.pathname);
            setNotice({ tone: "info", text: c("coPaymentNotFinished") });
            return;
          }
          // Stripe took the payment (or a bank debit is under way): the bag is bought, even if the webhook is still on
          // its way. A debit can still fail, so it is not "paid".
          if (stripeTookPayment(statusData?.status)) {
            clearCart();
            forgetAttempt(oid);
          }
        }
        if (isPayPalReturn) {
          const paypalOrderId = landing.paypalToken;
          const captureResponse = paypalOrderId ? await functionFetch("capturePayPalOrder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: oid, paypalOrderId }),
          }).catch(() => null) : null;
          if (cancelled) return;
          if (!captureResponse || !captureResponse.ok) {
            // No money was taken: never show the "thank you / payment went through" screen.
            window.history.replaceState(null, "", window.location.pathname);
            dispatchFlow({ type: "paypalFailed" });
            setNotice({ tone: "error", text: c(paypalOrderId ? "coPaypalCaptureError" : "coErrPaypalToken") });
            return;
          }
          window.history.replaceState(null, "", settledUrl);
        }

        // Firestore is authoritative. URL flags and the capture HTTP response
        // never confirm payment on their own; wait for the paid order update.
        for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
          const order: any = await adminApi.getPublicOrder(oid, { email: lookupEmail }).catch(() => null);
          if (cancelled) return;
          if (order) setSuccessOrder(order);
          dispatchFlow({ type: "orderSeen", paymentStatus: order?.paymentStatus });
          if (order?.paymentStatus === "paid") {
            forgetAttempt(oid);
            // After "your earlier payment already went through", a bag of different books is a new
            // purchase in progress: leave it alone and don't count the old order's purchase again.
            if (isPreviousPaid && !sameOrderLines(cartRef.current, order.items)) return;
            clearCart();
            funnelApi.trackPurchase(oid, order);
            const email = order.customer?.email || localStorage.getItem("last_customer_email") || "";
            const recoveryCartId = sessionStorage.getItem("fm_checkout_cart_id") || `active_${email.toLowerCase()}`;
            abandonedCartApi.markRecovered(recoveryCartId);
            sessionStorage.removeItem("fm_checkout_cart_id");
            return;
          }
          if (order?.paymentStatus === "pending") {
            clearCart();
            forgetAttempt(oid);
            funnelApi.trackPurchase(oid, order);
            const email = order.customer?.email || localStorage.getItem("last_customer_email") || "";
            const recoveryCartId = sessionStorage.getItem("fm_checkout_cart_id") || `active_${email.toLowerCase()}`;
            abandonedCartApi.markRecovered(recoveryCartId);
            sessionStorage.removeItem("fm_checkout_cart_id");
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
        if (!cancelled) dispatchFlow({ type: "gaveUp" });
      } catch (err) {
        if (!cancelled) dispatchFlow({ type: "gaveUp" });
        console.error("Failed to confirm payment on success landing", err);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Success screen ──────────────────────────────────────────────────────────
  if (flow.step === "confirming") {
    const view = confirmationView(flow, successOrder);
    const isManual = view.manual;
    const stampState = view.stamp;
    const orderNumber = flow.orderId;
    const accountEmail = successOrder?.customer?.email || customer.email;
    return (
      <div data-fm-store data-studio-target="copy:Checkout|style:checkout" data-studio-label="Checkout" data-fm-checkout className="fm-track min-h-screen fm-surface text-white relative overflow-x-hidden">
        <StorefrontThemeStyle design={checkoutDesign} />
        <style>{TRACKING_CSS}</style>
        <div aria-hidden="true" className="fm-track-strip" />
        <m.div {...regionProps("checkoutSuccess")} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35 }}
          className="relative z-10 mx-auto w-full max-w-2xl px-4 sm:px-6 py-12 sm:py-16 space-y-8">
          <header {...regionProps("checkoutSuccessHeader")} className="fm-track-card p-6 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="fm-track-mono" style={{ color: "var(--accent)" }}>
                {c(view.headline)}
              </p>
              <span className="fm-track-stamp" data-state={stampState}>
                {stampState === "paid" ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
                {orderNumber}
              </span>
            </div>
            <h2 {...regionProps("checkoutSuccessHeading")} className="fm-track-display text-6xl sm:text-8xl mt-6 break-words">{c("coThanks")}</h2>
            <p className="fm-track-mono mt-5 border-t-2 fm-track-rule pt-4">{c("coOrderNumber", { number: orderNumber })}</p>
            {flow.previousPaid && <div className="fm-track-notice mt-4" role="status"><p>{c("coPreviousPaid")}</p></div>}
            {view.status && (
              <p className="text-sm leading-6 text-white/70 mt-4" role="status">
                {c(view.status, { email: successOrder?.customer?.email || customer.email || "" })}
              </p>
            )}
          </header>

          {isManual && (
            <section {...regionProps("checkoutPaymentInstructions")} className="fm-track-card p-6 sm:p-8 space-y-4">
              <h3 className="fm-track-mono flex items-center gap-2" style={{ color: "var(--accent)" }}>
                <Building size={14} aria-hidden="true" /> {successOrder?.paymentMethod || c("coPaymentInstructions")}
              </h3>
              <p className="text-sm leading-6 text-white/80 whitespace-pre-wrap">
                {successOrder?.paymentInstructions || c("coCheckEmail")}
              </p>
              <div className="fm-track-notice" data-tone="warning"><p><strong aria-hidden="true">! </strong>{c("coPending")}</p></div>
            </section>
          )}

          {(successOrder?.fulfillment?.method === "pickup" || successOrder?.fulfillment?.method === "local_delivery") && (
            <section {...regionProps("checkoutFulfillment")} className="fm-track-card p-6 sm:p-8 space-y-3">
              <h3 className="fm-track-mono">{c("coShipMethod")}</h3>
              <p className="fm-track-display text-3xl sm:text-4xl">{successOrder.fulfillment.name}</p>
              <div className="border-t-2 fm-track-rule pt-3 space-y-2 text-sm leading-6 text-white/70">
                {successOrder.fulfillment.method === "pickup" && successOrder.fulfillment.address && <address className="not-italic">
                  {[successOrder.fulfillment.address.street, successOrder.fulfillment.address.city, successOrder.fulfillment.address.state, successOrder.fulfillment.address.zip, successOrder.fulfillment.address.country].filter(Boolean).join(", ")}
                </address>}
                {successOrder.fulfillment.hours && <p><span className="fm-track-mono">{c("coFulfillmentHours")}</span> {successOrder.fulfillment.hours}</p>}
                {successOrder.fulfillment.estimate && <p><span className="fm-track-mono">{c("coFulfillmentEstimate")}</span> {successOrder.fulfillment.estimate}</p>}
                {successOrder.fulfillment.instructions && <p className="whitespace-pre-wrap"><span className="fm-track-mono">{c("coFulfillmentInstructions")}</span> {successOrder.fulfillment.instructions}</p>}
              </div>
            </section>
          )}

          {successOrder && (successOrder.items || []).length > 0 && (
            <section {...regionProps("checkoutSuccessSummary")} className="fm-track-card p-6 sm:p-8">
              <h3 className="fm-track-mono mb-2">{c("coSuccessSummary")}</h3>
              <ol className="fm-track-ledger text-sm">
                {successOrder.items.map((item: any, i: number) => (
                  <li key={`${item.id}-${item.variantId || ""}-${i}`} className="fm-track-row">
                    <span className="flex gap-3 min-w-0">
                      <span className="fm-track-mono shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-white/85 break-words">{item.title}{item.variantName ? ` · ${item.variantName}` : ""} <span className="fm-track-mono">× {item.quantity}</span></span>
                    </span>
                    <span className="font-mono text-white/70 shrink-0" translate="no">{orderMoney(Number(item.price || 0) * Number(item.quantity || 0), successOrder, formatPrice)}</span>
                  </li>
                ))}
                <li className="fm-track-total">
                  <span className="fm-track-display text-2xl">{c("summaryTotal")}</span>
                  <span className="font-mono text-xl font-bold" translate="no">{orderChargedTotal(successOrder, formatPrice)}</span>
                </li>
              </ol>
              {successOrder.shippingMethod && !["pickup", "local_delivery"].includes(successOrder.fulfillment?.method) && (
                <div {...regionProps("checkoutSuccessDelivery")} className="mt-5 border-t-2 fm-track-rule pt-4 space-y-1 text-xs leading-5 text-white/60">
                  <p><span className="fm-track-mono">{c("coSuccessShipping")}</span> {successOrder.shippingMethod}</p>
                  {successOrder.shippingEstimate?.days ? (
                    <p>{c("coCarrierTransit", { days: successOrder.shippingEstimate.days })}</p>
                  ) : successOrder.shippingEstimate?.terms ? (
                    <p>{successOrder.shippingEstimate.terms}</p>
                  ) : null}
                  {successOrder.customer?.address?.street && (
                    <p><span className="fm-track-mono">{c("coSuccessShipTo")}</span> {[successOrder.customer.address.street, successOrder.customer.address.unit, successOrder.customer.address.city, successOrder.customer.address.state, successOrder.customer.address.zip].filter(Boolean).join(", ")}</p>
                  )}
                  <p>{c("coSuccessTrackingNote")}</p>
                </div>
              )}
            </section>
          )}

          {!currentUser && accountsEnabled(checkoutDesign) && accountEmail && (
            <section {...regionProps("checkoutAccountOffer")} className="fm-track-notice" style={{ borderColor: "rgba(var(--fg-rgb), 0.35)" }}>
              <div className="space-y-1 text-left">
                <h3 className="fm-track-mono">{c("coAccountTitle")}</h3>
                <p className="text-sm leading-6 text-white/70">{c("coAccountText", { email: accountEmail })}</p>
              </div>
              <Link to={`/account?email=${encodeURIComponent(accountEmail)}`} className="fm-track-btn fm-track-btn-ghost">
                {c("coAccountButton")}
              </Link>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link {...regionProps("checkoutTrackOrder")} to={successOrder ? trackLink(successOrder) : `/track?orderId=${encodeURIComponent(orderNumber)}`}
              className="fm-track-btn w-full">
              {c("coTrackOrder")}
            </Link>
            <Link {...regionProps("checkoutContinue")} to="/" className="fm-track-btn fm-track-btn-ghost w-full">
              {c("coContinue")}
            </Link>
          </div>
        </m.div>
      </div>
    );
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div data-fm-store data-studio-target="copy:Checkout|style:checkout" data-studio-label="Checkout" data-fm-checkout className="h-screen fm-surface text-white flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
        <StorefrontThemeStyle design={checkoutDesign} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--accent-rgb,232,64,42),0.08)_0%,transparent_70%)] pointer-events-none" />
        <div {...regionProps("checkoutEmpty")} className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center mb-8">
            <Package size={36} className="text-white/20" strokeWidth={1} />
          </div>
          <p className="text-[9px] font-black tracking-[0.5em] text-white/20 uppercase mb-4">{c("coEmptyEyebrow")}</p>
          <h2 className="text-4xl font-black tracking-tighter uppercase italic text-white mb-12">{c("coEmptyTitle")}</h2>
          <Link to="/"
            className="fm-active px-10 py-4 rounded-2xl text-[10px] font-black tracking-[0.3em] uppercase hover:bg-white/90 transition-all active:scale-95">
            {c("coEmptyButton")}
          </Link>
        </div>
      </div>
    );
  }

  // ── Main checkout ───────────────────────────────────────────────────────────
  const hasStripe = Boolean(settings?.payments?.stripe?.connected);
  const hasPaypal = Boolean(settings?.payments?.paypal?.connected);
  const configuredManualMethods = settings?.payments?.manualMethods;
  const enabledManualMethods = (Array.isArray(configuredManualMethods) ? configuredManualMethods : []).filter((method: any) => method.enabled);
  // Physical books with no delivery option chosen yet: the total isn't final, so don't present one.
  const needsDeliveryChoice = physicalItems.length > 0 && !(fulfillmentSelection.method === "shipping" ? selectedShippingQuote : selectedLocalQuote);
  const showTotalOnPay = !checkoutDesign.hidePayButtonTotal && cart.length > 0 && !needsDeliveryChoice;
  // Pay button: the words on the left, the total on the right (order slip). Read aloud as one phrase.
  const payLabel = selectedPaymentMethod === "stripe" ? c("coPay") : selectedPaymentMethod === "paypal" ? c("coPayPal") : c("coPlaceOrder");
  const payTotal = showTotalOnPay ? formatPrice(finalTotal) : "";
  const paymentLabel = payTotal ? `${payLabel} ${payTotal}` : payLabel;
  // The phone bar's words with the live total kept out of page translation (a translated number stops updating).
  const TOTAL_SLOT = "\u0000";
  const barWords = selectedPaymentMethod === "stripe" && payTotal ? c("coPayWithTotal", { total: TOTAL_SLOT }) : (payTotal ? `${payLabel} ${TOTAL_SLOT}` : payLabel);
  const barParts = barWords.split(TOTAL_SLOT);
  const barLabel = barParts.length > 1
    ? <>{barParts[0]}<span translate="no">{payTotal}</span>{barParts.slice(1).join(payTotal)}</>
    : barWords;
  // Also waits while carrier rates load (the picker shows the loading words), instead of "choose an option".
  const payDisabled = isCompleting || catalogState !== "ready" || (shippoRatesLoading && !digitalOnly && physicalItems.length > 0 && fulfillmentSelection.method === "shipping") || (finalTotal > 0 && selectedPaymentMethod === "stripe" && !stripeRoute.canPay) || (finalTotal > 0 && !hasStripe && !hasPaypal && enabledManualMethods.length === 0);
  const labelsAbove = checkoutLabelsAbove(checkoutDesign);
  const payTabs = checkoutPayTabs(checkoutDesign);
  const payBar = checkoutPayBarOn(checkoutDesign);
  const slipNumbers = checkoutDesign.checkoutSlipNumbers ?? true;
  const [brandLead, brandLast] = splitBrand(c("coBrand"));
  const showShipTo = fulfillmentSelection.method !== "pickup" || pickupNeedsAddress;
  const sectionOrder = ["contact", ...(showShipTo ? ["shipTo"] : []), ...(digitalOnly ? [] : ["delivery"]), "pay"];
  const mark = (key: string) => checkoutMarker(checkoutDesign, sectionOrder.indexOf(key));
  const itemCount = c(cartCount === 1 ? "coItemCountOne" : "coItemCountMany", { count: cartCount });
  const slipDate = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const discountBoxOn = checkoutDesign.showCheckoutDiscountBox !== false || Boolean(appliedDiscount) || Boolean(discountCode);
  const giftCardBoxOn = checkoutDesign.showCheckoutGiftCardBox !== false;
  const policyLinks = checkoutPolicies.map((k, i) => (
    <span key={k}>
      {i > 0 && (i === checkoutPolicies.length - 1 ? ` ${c("coPolicyAnd")} ` : ", ")}
      <Link to={`/page/${policySlug(k)}`} target="_blank" rel="noopener" className="underline underline-offset-2">{policyTitle(checkoutDesign, k)}</Link>
    </span>
  ));

  // The discount and gift card boxes: in the slip on computers, in the Pay section on phones and tablets.
  const codeBoxes = (
    <>
      {/* Hidden in Studio, the box still appears for a code already in play (a shared discount link or an applied code), so the shopper can always see and remove it. */}
      {discountBoxOn && (
        <div {...regionProps("checkoutDiscount")}>
          {!(checkoutDesign.alwaysShowDiscountBox || discountOpen || appliedDiscount || discountCode) ? (
            <button type="button" onClick={() => setDiscountOpen(true)} data-studio-target="copy:Checkout" data-studio-label="Discount code link" className="fm-co-link fm-co-mono">
              <Tag size={14} aria-hidden="true" /> {c("coHaveCode")}
            </button>
          ) : (
            <div className="fm-co-code-row">
              <input
                type="text"
                value={discountCode}
                onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyDiscount(); } }}
                placeholder={c("coDiscount")}
                aria-label={c("coDiscount")}
                disabled={Boolean(appliedDiscount)}
                // Locked while a code is being checked, so a late answer can't apply to a different code.
                readOnly={isApplying}
                aria-busy={isApplying}
                autoComplete="off"
                className="fm-co-input"
              />
              {appliedDiscount ? (
                <button type="button" onClick={removeDiscount} className="fm-co-btn-outline" aria-label={c("coDiscountRemove")}><X size={16} /></button>
              ) : (
                <button type="button" onClick={applyDiscount} disabled={isApplying || !discountCode} className="fm-co-btn-outline fm-co-mono">
                  {isApplying ? <Loader2 size={16} className="animate-spin" /> : c("coApply")}
                </button>
              )}
            </div>
          )}
          {discountError && <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} />{discountError}</p>}
          {appliedDiscount && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--success)" }}><CheckCircle2 size={13} />{c("coDiscountApplied", { code: appliedDiscount.code })}</p>}
        </div>
      )}
      {autoBeatsCode && checkoutDesign.showCheckoutAutoDiscountHint !== false && (
        <div role="note" className="fm-co-box text-xs" data-studio-target="style:checkout|copy:Checkout" data-studio-label="Automatic offer hint">
          <p>{c("coAutoBetter", { title: autoPick?.discount?.title || "" })}</p>
          <button type="button" onClick={removeDiscount} className="mt-1.5 font-semibold underline underline-offset-4">{c("coAutoBetterRemove", { title: autoPick?.discount?.title || "" })}</button>
        </div>
      )}
      {giftCardBoxOn && (
        <div {...regionProps("checkoutGiftCard")}>
          {!(giftCardOpen || giftCards.length || giftCardInput) ? (
            <button type="button" onClick={() => setGiftCardOpen(true)} className="fm-co-link fm-co-mono">
              <CreditCard size={14} aria-hidden="true" /> {c("coGiftCardOpen")}
            </button>
          ) : (
            <>
              <div className="fm-co-code-row">
                <input
                  type="text"
                  value={giftCardInput}
                  onChange={e => setGiftCardInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyGiftCard(); } }}
                  readOnly={giftCardApplying}
                  aria-busy={giftCardApplying}
                  placeholder={c("coGiftCardLabel")}
                  aria-label={c("coGiftCardLabel")}
                  autoComplete="off"
                  spellCheck={false}
                  className="fm-co-input"
                />
                <button type="button" onClick={applyGiftCard} disabled={giftCardApplying || !giftCardInput.trim()} className="fm-co-btn-outline fm-co-mono">
                  {giftCardApplying ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /><span className="sr-only">{c("coGiftCardApplying")}</span></> : c("coGiftCardApply")}
                </button>
              </div>
              {giftCardError && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} />{giftCardError}</p>}
              {giftCards.map(card => (
                <p key={card.code} className="mt-2 flex items-center justify-between gap-2 text-xs font-medium" style={{ color: "var(--success)" }}>
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={13} />{c("coGiftCardApplied", { last4: card.last4, balance: formatPrice(card.balanceMinor / 100) })}</span>
                  <button type="button" onClick={() => setGiftCards(current => current.filter(other => other.code !== card.code))} aria-label={c("coGiftCardRemoveAria", { last4: card.last4 })} className="underline underline-offset-4">{c("coGiftCardRemove")}</button>
                </p>
              ))}
              {giftCards.length > 0 && selectedPaymentMethod.startsWith("manual_") && finalTotal > 0 && (
                <p role="note" className="mt-2 text-xs">{c("coGiftCardManual")}</p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
  const hasCodeBoxes = discountBoxOn || giftCardBoxOn;

  return (
    <div data-fm-store data-studio-target="copy:Checkout|style:checkout" data-studio-label="Checkout" data-fm-checkout data-paybar={payBar ? "on" : "off"} className="fm-co min-h-screen bg-white font-sans text-slate-900 selection:bg-sky-100">
      <StorefrontThemeStyle design={checkoutDesign} />
      {checkoutSlipFontNames(checkoutDesign).map(name => <link key={name} rel="stylesheet" href={googleFontHref(name)} />)}
      <style>{checkoutSlipCss(checkoutDesign)}</style>
      {settings?.payments?.testMode && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm font-medium text-amber-900">
          {c("coTestMode")}
        </div>
      )}

      <header {...regionProps("checkoutHeader")} className="fm-co-header">
        <Link to="/cart" className="fm-co-back fm-co-mono">
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="fm-co-back-text">{c("coReturn")}</span>
        </Link>
        <Link to="/" className="fm-co-brand">
          {(checkoutDesign.checkoutBrandAccent ?? true) && brandLead ? <>{brandLead} <span className="fm-co-brand-accent">{brandLast}</span></> : c("coBrand")}
        </Link>
        <div className="fm-co-secure fm-co-mono">
          <Lock size={14} aria-hidden="true" />
          <span className="fm-co-secure-text">{c("coSecure")}</span>
        </div>
      </header>

      <TemplateSections design={checkoutDesign} templateId="cartPage" />

      <div className="fm-co-grid">
        <main {...regionProps("checkoutForm")} className="min-w-0">
          <LabelsAbove.Provider value={labelsAbove}>
          <form noValidate onSubmit={e => { e.preventDefault(); void handleCompletePurchase(); }}
            // Enter in a text box must not start a payment (implicit submission); only the Pay button does.
            onKeyDown={e => {
              const el = e.target as HTMLElement;
              if (e.key === "Enter" && el.tagName === "INPUT" && !["submit", "button", "checkbox", "radio", "image", "reset"].includes((el as HTMLInputElement).type)) e.preventDefault();
            }}
            id="fm-checkout-form" className="fm-co-form">
            {(checkoutDesign.checkoutShowPageTitle ?? true) && <h1 {...regionProps("checkoutPageTitle")} className="fm-co-title">{c("coPageTitle")}</h1>}
            {checkoutDesign.showCheckoutProgress && (
              <div {...regionProps("checkoutProgress")} className="fm-co-mono fm-co-muted flex items-center gap-2" aria-label={c("coProgressAria")}>
                <span style={{ color: "var(--accent)" }}>{c("coStepInfo")}</span>
                <span aria-hidden="true">›</span>
                <span>{c("coStepShipping")}</span>
                <span aria-hidden="true">›</span>
                <span>{c("coStepPayment")}</span>
              </div>
            )}

            <CheckoutAddressStep c={c} mark={mark} checkoutDesign={checkoutDesign} currentUser={currentUser} handleGoogleLogin={handleGoogleLogin} customer={customer} setCustomer={setCustomer}
              fieldErrors={fieldErrors} labelsAbove={labelsAbove} pinnedCountryCodes={pinnedCountryCodes} showShipTo={showShipTo} digitalOnly={digitalOnly} />

            {!digitalOnly && (
            <CheckoutDeliveryStep c={c} mark={mark} checkoutDesign={checkoutDesign} physicalItems={physicalItems} fulfillmentSelection={fulfillmentSelection} selectFulfillment={selectFulfillment}
              availableRates={availableRates} localQuotes={localQuotes} availableFulfillmentMethods={availableFulfillmentMethods} shippoRatesLoading={shippoRatesLoading} formatPrice={formatPrice}
              pickupNeedsAddress={pickupNeedsAddress} labelsAbove={labelsAbove} pinnedCountryCodes={pinnedCountryCodes} customer={customer} setCustomer={setCustomer} selectedLocalQuote={selectedLocalQuote} />
            )}

            {orderNoteBoxOn(checkoutDesign) && (
              <section data-studio-target="style:checkout|copy:Checkout" data-studio-label="Order note" className="fm-co-field">
                <label htmlFor="checkout-order-note" className="fm-co-label fm-co-mono">{c("coOrderNote")}</label>
                {c("coOrderNoteHelp") && <p className="fm-co-note">{c("coOrderNoteHelp")}</p>}
                <textarea
                  id="checkout-order-note"
                  value={orderNote}
                  onChange={e => setOrderNote(e.target.value.slice(0, 500))}
                  maxLength={500}
                  rows={3}
                  className="fm-co-input"
                />
              </section>
            )}

            <CheckoutPaymentStep c={c} mark={mark} checkoutDesign={checkoutDesign} needsDeliveryChoice={needsDeliveryChoice} formatPrice={formatPrice} finalTotal={finalTotal}
              payTabs={payTabs} hasStripe={hasStripe} hasPaypal={hasPaypal} isCompleting={isCompleting} selectedPaymentMethod={selectedPaymentMethod} setSelectedPaymentMethod={setSelectedPaymentMethod}
              enabledManualMethods={enabledManualMethods} hasCodeBoxes={hasCodeBoxes} codeBoxes={codeBoxes} holdIssues={holdIssues} notice={notice} noticeRef={noticeRef} catalogState={catalogState}
              termsRequired={termsRequired} termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted} termsError={termsError} policyLinks={policyLinks}
              payDisabled={payDisabled} paymentLabel={paymentLabel} payLabel={payLabel} payTotal={payTotal} checkoutPolicies={checkoutPolicies}
              stripeOption={hasStripe && (
              <StripePaymentSection
                design={checkoutDesign}
                tabs={payTabs}
                selected={selectedPaymentMethod === "stripe"}
                configured={useCardForm}
                canRetry={stripeRoute.canRetry}
                busy={isCompleting}
                onSelect={() => setSelectedPaymentMethod("stripe")}
                onRetry={() => {
                  if (inlineAttemptStarted || isCompleting) return;
                  setCardState("loading");
                  setCardFormAttempt(attempt => attempt + 1);
                  setNotice(null);
                }}
              >
                <StripeCardForm
                  key={cardFormAttempt}
                  ref={cardFormRef}
                  publishableKey={stripePublicKey}
                  amountCents={Math.round(convertPrice(finalTotal) * 100)}
                  currency={currency}
                  loadingText={c("coStripeLoading")}
                  errorText={c("coStripeLoadError")}
                  validationText={c("coCardValidationError")}
                  paymentErrorText={c("coCardPaymentError")}
                  onStateChange={setCardState}
                  expressText={c("coExpressCheckout")}
                  showExpress={!checkoutDesign.hideCheckoutExpressWallets}
                  expressEnabled={expressWalletEnabled({ isCompleting, canPay: stripeRoute.canPay, needsDeliveryChoice, catalogReady: catalogState === "ready", total: finalTotal, problems: detailProblems, termsAccepted: !termsRequired || termsAccepted })}
                  onExpressConfirm={async () => { await handleCompletePurchase(); return purchaseNavigating.current; }}
                  fontName={checkoutDesign.checkoutFieldFont || checkoutDesign.checkoutFont || checkoutDesign.font || checkoutDesign.bodyFont || undefined}
                  fieldBackground={checkoutDesign.checkoutFieldBg || undefined}
                  fieldText={checkoutDesign.checkoutFieldText || undefined}
                  fieldBorder={checkoutDesign.checkoutFieldBorder || undefined}
                  accentColor={checkoutDesign.checkoutAccentColor || undefined}
                  fieldRadius={checkoutDesign.checkoutInputRadius}
                  style={{
                    background: checkoutDesign.stripeFormBg || undefined,
                    padding: checkoutDesign.stripeFormPadding != null ? `${checkoutDesign.stripeFormPadding}px` : undefined,
                    borderRadius: checkoutDesign.checkoutInputRadius != null ? `${checkoutDesign.checkoutInputRadius}px` : undefined,
                  }}
                />
              </StripePaymentSection>
              )} />

            {checkoutDesign.showCheckoutTrustRow && (
              <footer data-studio-target="copy:Checkout|style:checkout" data-studio-label="Trust badges" className="fm-co-mono fm-co-muted flex flex-wrap justify-center gap-x-6 gap-y-2 border-t pt-6" style={{ borderColor: "var(--co-rule)" }}>
                <span>{c("coTrust1")}</span>
                <span>{c("coTrust2")}</span>
                <span>{c("coTrust3")}</span>
              </footer>
            )}
          </form>
          </LabelsAbove.Provider>
        </main>

        <CheckoutOrderSummary c={c} checkoutDesign={checkoutDesign} cart={cart} booksMap={booksMap} summaryOpen={summaryOpen} setSummaryOpen={setSummaryOpen}
          itemCount={itemCount} slipDate={slipDate} slipNumbers={slipNumbers} formatPrice={formatPrice} freeGift={freeGift} preorderShip={preorderShip}
          hasCodeBoxes={hasCodeBoxes} codeBoxes={codeBoxes} itemsSubtotal={itemsSubtotal} discountAmount={discountAmount} appliedDiscount={appliedDiscount} autoPick={autoPick}
          getActiveShippingDetails={getActiveShippingDetails} needsDeliveryChoice={needsDeliveryChoice} isFreeShipping={isFreeShipping} shippingCost={shippingCost}
          finalShipping={finalShipping} taxCost={taxCost} taxKnown={taxKnown} giftCardUse={giftCardUse} freeShipNudge={freeShipNudge} cartTotal={cartTotal} finalTotal={finalTotal} />
      </div>

      {payBar && (
        <div {...regionProps("checkoutPayBar")} className="fm-co-paybar">
          <div className="fm-co-paybar-row fm-co-mono">
            <span>{c("coPayBarLabel")}</span>
            <span translate="no">{needsDeliveryChoice ? c("coShipChoose") : formatPrice(finalTotal)}</span>
          </div>
          <button type="submit" form="fm-checkout-form" disabled={payDisabled} className="fm-co-paybtn">
            {isCompleting ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" /> {c("coProcessing")}</> : barLabel}
          </button>
        </div>
      )}

      <GlobalSections design={checkoutDesign} />
    </div>
  );
}
