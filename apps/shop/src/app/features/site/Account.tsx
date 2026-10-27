import { orderChargedTotal } from "./orderMoney";
import { finishEmailLinkSignIn } from "./emailLinkSignIn";
import { digitalEntries, downloadBookIds, UNREADABLE_BOOK, type DigitalEntry } from "./digitalLine";
import { publicApi } from "../../lib/publicApi";
import { orderLineNotes } from "./orderLineNotes";
import { regionProps } from "./storefrontRegions";
import { getTrackingUrl } from "../../lib/tracking";
import { accountsEnabled } from "./customerAccounts";
import { statusCopyKey, statusTone, trackLink } from "./orderStatus";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  type User,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  setDoc,
  doc,
  getDoc,
  limit,
} from "firebase/firestore";
import { auth, db, googleProvider } from "../../../lib/firebase";
import { 
  ArrowLeft, LogOut, Package, Heart, MapPin, User as UserIcon, Loader2, 
  ChevronDown, ChevronUp, Mail, ExternalLink, Download 
} from "lucide-react";
import { useSEO } from "../../lib/seo";
import { useWishlist, liveWishlistCount } from "../../lib/wishlist";
import { isLiveBook } from "./liveBook";
import { useSiteData } from "./useSiteData";
import { StoreChrome, useInStoreChrome } from "./StoreChrome";
import { getCopy } from "./storeCopy";
import { useCurrency } from "../../CurrencyContext";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { functionUrl } from "../../lib/functionsBase";
import toast from "react-hot-toast";
import { useCart } from "../../CartContext";
import { reorderPlan } from "./reorder";
import { inEditorPreview } from "../../lib/trackingGuard";

type CustomerProfile = {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  defaultAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
};

// Card/PayPal checkouts that were never paid are abandoned attempts, not orders.
const isAbandonedCheckout = (o: any) => o.paymentStatus === "unpaid" && o.status === "pending_payment" && ["Stripe", "PayPal"].includes(o.paymentMethod);

const EMPTY_ADDRESS = { street: "", city: "", state: "", zip: "", country: "Canada", phone: "", name: "" };

/** The customer account, inside the one shop header and footer (Studio 2.0 · 2.1). */
export default function AccountPage() {
  return <StoreChrome surface="accountPage"><AccountContent /></StoreChrome>;
}

function AccountContent() {
  // Under the shop header this title bar is a plain row, not a second <header>.
  const TitleBar = useInStoreChrome() ? "div" : "header";
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  // The order list couldn't be read: say so with Try again instead of looking like "no orders".
  const [ordersError, setOrdersError] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const buyAgainBusy = useRef(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [digitalItems, setDigitalItems] = useState<Record<string, DigitalEntry[]>>({});
  
  // Auth states
  const [emailLinkInput, setEmailLinkInput] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  // Email the sign-in link went to; switches the card to its "check your inbox" state.
  const [linkSentTo, setLinkSentTo] = useState("");
  // Sign-in link opened on a device that didn't request it: ask for the email on the card.
  const [confirmingLink, setConfirmingLink] = useState(false);
  
  // Address edit states
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  // The account whose data is on screen; a slow load for a previous account is dropped.
  const activeUid = useRef<string | null>(null);

  const { ids: wishedIds } = useWishlist();
  const { settings, books } = useSiteData();
  const { addToCart } = useCart();
  const wishlistCount = liveWishlistCount(wishedIds, books, isLiveBook);
  const { formatPrice } = useCurrency();
  // Sign-in toasts run after awaits (and from mount effects): read the latest Text & labels, not the first render's.
  const designRef = useRef<any>(settings?.design);
  designRef.current = settings?.design;
  // Order amounts are stored in CAD; show them in the shopper's chosen currency like the rest of the store.
  // An order paid in another currency is shown in that currency, like the tracking page.
  const money = (v: number | undefined, o?: any) => {
    const n = Number(v) || 0;
    if (o?.checkoutCurrency && o?.exchangeRate) {
      const symbols: Record<string, string> = { CAD: "CA$ ", USD: "$ ", EUR: "€ " };
      return `${symbols[o.checkoutCurrency] || "$ "}${(n * o.exchangeRate).toFixed(2)}`;
    }
    return formatPrice(n);
  };

  useSEO({ title: getCopy(settings?.design, "seoAccountTitle"), description: getCopy(settings?.design, "seoAccountDescription") });

  async function completeEmailLinkSignIn(email: string) {
    const result = await finishEmailLinkSignIn(email, {
      signIn: address => signInWithEmailLink(auth, address, window.location.href),
      forgetSavedEmail: () => { try { window.localStorage.removeItem("emailForSignIn"); } catch { /* storage blocked */ } },
    });
    if (result.ok) {
      setConfirmingLink(false);
      // Drop the one-time sign-in code from the address bar.
      window.history.replaceState(null, "", window.location.pathname);
      toast.success(getCopy(designRef.current, "accountSignedInLink"));
    } else {
      console.error("Email link sign in error:", result.error);
      // Keep the confirm-your-email card (and the link's code in the address) so the address can be retyped.
      setConfirmingLink(true);
      toast.error(getCopy(designRef.current, "accountSignInError"));
    }
  }

  // Prefill the email field when arriving from the order confirmation page.
  useEffect(() => {
    const fromCheckout = new URLSearchParams(window.location.search).get("email");
    if (fromCheckout) setEmailLinkInput(fromCheckout);
  }, []);

  // Handle incoming email sign-in links on mount
  useEffect(() => {
    const handleEmailAuthRedirect = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setAuthLoading(true);
        // In-app mail browsers often block storage: ask for the email instead of failing.
        let email: string | null = null;
        try { email = window.localStorage.getItem("emailForSignIn"); } catch { email = null; }
        if (email) await completeEmailLinkSignIn(email);
        else setConfirmingLink(true);
        setAuthLoading(false);
      }
    };
    handleEmailAuthRedirect();
  }, []);

  // Standard preview handler
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("preview=true")) {
      window.parent.postMessage({ type: "PREVIEW_READY" }, "*");
    }
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      // Signing out, or another customer signing in on a shared device, must never show the
      // previous customer's orders, downloads or address (or save that address to the new account).
      if (activeUid.current !== (u?.uid || null)) {
        activeUid.current = u?.uid || null;
        setOrders([]);
        setProfile(null);
        setDigitalItems({});
        setExpandedOrderId(null);
        setIsEditingAddress(false);
        setAddressForm(EMPTY_ADDRESS);
      }
      setUser(u);
      setAuthLoading(false);
      if (u) {
        loadCustomerData(u);
      }
    });
    return () => unsub();
  }, []);

  async function loadCustomerData(u: User) {
    setLoadingData(true);
    setOrdersError(false);
    const stale = () => activeUid.current !== u.uid;
    try {
      const profRef = doc(db, "customers", u.uid);
      const profSnap = await getDoc(profRef);
      if (stale()) return;
      if (profSnap.exists()) {
        const data = profSnap.data() as CustomerProfile;
        setProfile(data);
        // Pre-fill address edit form
        setAddressForm({
          street: data.defaultAddress?.street || "",
          city: data.defaultAddress?.city || "",
          state: data.defaultAddress?.state || "",
          zip: data.defaultAddress?.zip || "",
          country: data.defaultAddress?.country || "Canada",
          phone: data.phone || "",
          name: data.name || u.displayName || "",
        });
      } else {
        const fresh: CustomerProfile = {
          uid: u.uid,
          email: u.email || "",
          name: u.displayName || "",
        };
        // The Studio preview (and its Check every page) shows the account as it would look but never creates a
        // customer record for the signed-in owner (that would also send them a welcome email).
        if (!inEditorPreview()) await setDoc(profRef, fresh);
        if (stale()) return;
        setProfile(fresh);
        setAddressForm({ ...EMPTY_ADDRESS, name: fresh.name });
      }
      
      try {
        const q = query(
          collection(db, "orders"),
          where("customer.email", "==", u.email),
          orderBy("createdAt", "desc"),
          limit(50),
        );
        const snap = await getDocs(q);
        const loadedOrders = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((order: any) => order.isTest !== true && !isAbandonedCheckout(order));
        if (stale()) return;
        setOrders(loadedOrders);
        checkDigitalAssets(loadedOrders, u.uid);
      } catch {
        const fallbackQuery = query(
          collection(db, "orders"),
          where("customer.email", "==", u.email)
        );
        const snap = await getDocs(fallbackQuery);
        const loadedOrders = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((order: any) => order.isTest !== true && !isAbandonedCheckout(order))
          .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
          .slice(0, 50);
        if (stale()) return;
        setOrders(loadedOrders);
        checkDigitalAssets(loadedOrders, u.uid);
      }
    } catch (err) {
      console.error("Failed to load account data", err);
      if (!stale()) setOrdersError(true);
    } finally {
      if (!stale()) setLoadingData(false);
    }
  }

  // Scan order items for secure digital eBook versions
  // ⚡ Bolt: Eliminate N+1 queries by gathering unique book IDs and fetching them concurrently.
  async function checkDigitalAssets(loadedOrders: any[], uid: string) {
    const assetMap: Record<string, DigitalEntry[]> = {};

    // 1. Gather unique item IDs
    const uniqueItemIds = new Set<string>();
    for (const order of loadedOrders) {
      if (order.paymentStatus === "paid") {
        for (const id of downloadBookIds(order)) uniqueItemIds.add(id);
      }
    }

    // 2. Fetch all unique items concurrently
    const booksById: Record<string, any> = {};
    await Promise.all(
      Array.from(uniqueItemIds).map(async (id) => {
        try {
          const book: any = await publicApi.getBook(id).catch(() => null);
          booksById[id] = book || UNREADABLE_BOOK;
        } catch (err) {
          console.warn("E-Book metadata scan error:", err);
        }
      })
    );

    // 3. Map back to orders
    for (const order of loadedOrders) {
      if (order.paymentStatus !== "paid") continue;
      const entries = digitalEntries(order, booksById);
      if (entries.length > 0) assetMap[order.id] = entries;
    }
    if (activeUid.current === uid) setDigitalItems(assetMap);
  }

  // Passwordless Email Link triggers
  async function handleSendMagicLink(e?: React.FormEvent, resendTo?: string) {
    e?.preventDefault();
    const email = (resendTo || emailLinkInput).trim();
    if (!email) return;
    setSendingLink(true);
    try {
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // The link was sent; a blocked store only means the shopper confirms their email on return.
      try { window.localStorage.setItem("emailForSignIn", email); } catch { /* storage blocked */ }
      if (resendTo) toast.success(getCopy(designRef.current, "accountLinkSent"));
      setLinkSentTo(email);
    } catch (err: any) {
      console.error(err);
      toast.error(getCopy(designRef.current, "accountMagicLinkError"));
    } finally {
      setSendingLink(false);
    }
  }

  async function handleGoogleSignIn() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const provider = googleProvider || new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success(getCopy(designRef.current, "accountSignedIn"));
    } catch (err: any) {
      // Closing the Google window (or a second click replacing it) is the shopper's choice, not an error.
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
      console.error(err);
      toast.error(getCopy(designRef.current, "accountGoogleError"));
    } finally {
      setGoogleBusy(false);
    }
  }

  // Put the address form back to the saved address (Cancel / Abort / Close keep nothing typed).
  function resetAddressForm() {
    setAddressForm({
      street: profile?.defaultAddress?.street || "",
      city: profile?.defaultAddress?.city || "",
      state: profile?.defaultAddress?.state || "",
      zip: profile?.defaultAddress?.zip || "",
      country: profile?.defaultAddress?.country || "Canada",
      phone: profile?.phone || "",
      name: profile?.name || user?.displayName || "",
    });
  }
  function closeAddressForm() {
    resetAddressForm();
    setIsEditingAddress(false);
  }

  function buyAgain(o: any) {
    // A double click must not put every line in the bag twice.
    if (buyAgainBusy.current) return;
    buyAgainBusy.current = true;
    window.setTimeout(() => { buyAgainBusy.current = false; }, 800);
    const plan = reorderPlan(o, books);
    let added = 0;
    let skipped = plan.skipped;
    for (const l of plan.lines) {
      if (addToCart(l.book, l.variant, l.quantity)) added += l.quantity; else skipped++;
    }
    if (!added) toast.error(getCopy(settings?.design, "accountBuyAgainNone"));
    else toast.success(getCopy(settings?.design, skipped ? "accountBuyAgainSome" : "accountBuyAgainDone", { count: added, skipped }));
  }

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!user || savingAddress) return;
    setSavingAddress(true);
    try {
      const updatedProfile: CustomerProfile = {
        uid: user.uid,
        email: user.email || "",
        name: addressForm.name,
        phone: addressForm.phone,
        defaultAddress: {
          street: addressForm.street,
          city: addressForm.city,
          state: addressForm.state,
          zip: addressForm.zip,
          country: addressForm.country,
        }
      };
      await setDoc(doc(db, "customers", user.uid), updatedProfile);
      setProfile(updatedProfile);
      setIsEditingAddress(false);
      toast.success(getCopy(settings?.design, "accountAddressSaved"));
    } catch (err: any) {
      toast.error(getCopy(settings?.design, "accountAddressError"));
    } finally {
      setSavingAddress(false);
    }
  }

  const handleDownloadDigitalAsset = (order: any, itemId: string, variantId = "") => {
    if (!order.downloadToken) {
      toast.error(getCopy(settings?.design, "accountDownloadError"));
      return;
    }
    window.open(
      `${functionUrl("downloadDigitalAsset")}?orderId=${encodeURIComponent(order.id || order.orderId)}&itemId=${encodeURIComponent(itemId)}${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ""}&token=${encodeURIComponent(order.downloadToken)}`,
      "_blank"
    );
  };

  if (settings && !accountsEnabled(settings.design)) {
    return (
      <div data-fm-store data-studio-target="copy:Customer account|style:accounts" data-studio-label="Account page" className="min-h-screen fm-page text-white flex flex-col items-center justify-center px-6">
        <StorefrontThemeStyle design={settings?.design} />
        <div className="glass-card max-w-md w-full border border-white/10 p-8 sm:p-10 text-center space-y-5">
          <Package size={28} className="mx-auto" style={{ color: "var(--accent)" }} strokeWidth={1.5} />
          <h1 className="text-2xl font-black tracking-tight uppercase">{getCopy(settings?.design, "accountOffTitle")}</h1>
          <p className="text-sm fm-muted leading-relaxed">{getCopy(settings?.design, "accountOffText")}</p>
          <Link to="/track" className="block w-full fm-active py-4 text-[11px] font-black tracking-[0.2em] uppercase hover:bg-white/90 transition-all">
            {getCopy(settings?.design, "accountOffButton")}
          </Link>
          <Link to="/" className="block text-[11px] tracking-[0.2em] text-white/40 hover:text-white uppercase transition-colors">
            {getCopy(settings?.design, "accountBackToStore")}
          </Link>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div data-fm-store data-studio-target="copy:Customer account|style:colors|style:accounts" data-studio-label="Account page" className="min-h-screen fm-page text-white flex items-center justify-center">
        <StorefrontThemeStyle design={settings?.design} />
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div data-fm-store data-studio-target="copy:Customer account|style:colors|style:accounts" data-studio-label="Account page" className="min-h-screen fm-page text-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <StorefrontThemeStyle design={settings?.design} />
        <TemplateSections design={settings?.design} templateId="accountPage" books={books} />
        <GlobalSections design={settings?.design} books={books} />
        {/* Glow Effects */}
        <div {...regionProps("accountGlow")} className="absolute top-0 right-0 w-[500px] h-[500px] blur-[120px] rounded-full pointer-events-none" style={{ backgroundColor: "rgba(var(--accent-rgb), 0.05)" }} />
        <div {...regionProps("accountGlow")} className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-600/5 blur-[120px] rounded-full pointer-events-none" />

        <div {...regionProps("accountLogin")} className="glass-card max-w-md w-full border border-white/10 p-8 sm:p-10 relative z-10 space-y-7 shadow-2xl">
          <div {...regionProps("accountIntro")} className="text-center space-y-3">
            <div className="w-12 h-12 border border-white/10 flex items-center justify-center mx-auto">
              <UserIcon size={22} style={{ color: "var(--accent)" }} strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-black tracking-tight uppercase leading-none">{getCopy(settings?.design, "accountTitle")}</h1>
            <p className="text-sm fm-muted leading-relaxed max-w-xs mx-auto">{getCopy(settings?.design, "accountSubtitle")}</p>
          </div>

          {confirmingLink ? (
            <form
              onSubmit={async (e) => { e.preventDefault(); if (!emailLinkInput.trim()) return; setSendingLink(true); await completeEmailLinkSignIn(emailLinkInput); setSendingLink(false); }}
              className="space-y-4 text-center"
            >
              <h2 className="text-lg font-black uppercase tracking-wide">{getCopy(settings?.design, "accountConfirmEmailTitle")}</h2>
              <p className="text-sm fm-muted leading-relaxed">{getCopy(settings?.design, "accountConfirmEmailPrompt")}</p>
              <div className="relative text-left">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 fm-muted pointer-events-none" size={16} aria-hidden="true" />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  aria-label={getCopy(settings?.design, "accountSignInLabel")}
                  placeholder={getCopy(settings?.design, "accountEmailPlaceholder")}
                  value={emailLinkInput}
                  onChange={(e) => setEmailLinkInput(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 py-3.5 pl-11 pr-4 text-sm text-white outline-none focus:border-white/40 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={sendingLink || !emailLinkInput.trim()}
                className="w-full fm-active py-4 text-[11px] font-black tracking-[0.2em] uppercase hover:bg-white/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {sendingLink ? <Loader2 size={14} className="animate-spin" /> : getCopy(settings?.design, "accountConfirmEmailButton")}
              </button>
            </form>
          ) : linkSentTo ? (
            <div className="space-y-5 text-center" role="status" aria-live="polite">
              <div className="w-12 h-12 border border-white/10 flex items-center justify-center mx-auto">
                <Mail size={20} style={{ color: "var(--accent)" }} strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-black uppercase tracking-wide">{getCopy(settings?.design, "accountCheckInboxTitle")}</h2>
              <p className="text-sm fm-muted leading-relaxed">
                {getCopy(settings?.design, "accountCheckInboxText").replace("{email}", linkSentTo)}
              </p>
              <button
                type="button"
                disabled={sendingLink}
                onClick={() => handleSendMagicLink(undefined, linkSentTo)}
                className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white py-3.5 text-[11px] font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2"
              >
                {sendingLink ? <Loader2 size={14} className="animate-spin" /> : getCopy(settings?.design, "accountResendLink")}
              </button>
              <button
                type="button"
                onClick={() => setLinkSentTo("")}
                className="text-[11px] tracking-[0.2em] text-white/40 hover:text-white uppercase transition-colors"
              >
                {getCopy(settings?.design, "accountUseDifferentEmail")}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleBusy}
                aria-busy={googleBusy}
                className="w-full disabled:opacity-60 fm-active py-4 text-[11px] font-black tracking-[0.2em] uppercase hover:bg-white/90 transition-all flex items-center justify-center gap-2"
              >
                {getCopy(settings?.design, "accountGoogle")}
              </button>

              <div className="relative flex items-center" aria-hidden="true">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-4 text-[11px] tracking-[0.2em] text-white/40 uppercase">{getCopy(settings?.design, "accountOr")}</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <form onSubmit={handleSendMagicLink} className="space-y-3" noValidate={false}>
                <label htmlFor="account-email" className="text-[11px] font-bold fm-muted uppercase tracking-[0.15em] block">{getCopy(settings?.design, "accountSignInLabel")}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 fm-muted pointer-events-none" size={16} aria-hidden="true" />
                  <input
                    id="account-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    placeholder={getCopy(settings?.design, "accountEmailPlaceholder")}
                    value={emailLinkInput}
                    onChange={(e) => setEmailLinkInput(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 py-3.5 pl-11 pr-4 text-sm text-white outline-none focus:border-white/40 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sendingLink || !emailLinkInput.trim()}
                  className="w-full bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 text-white py-3.5 text-[11px] font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2"
                >
                  {sendingLink ? <Loader2 size={14} className="animate-spin" /> : getCopy(settings?.design, "accountMagicLink")}
                </button>
                <p className="text-xs fm-muted leading-relaxed text-center">{getCopy(settings?.design, "accountEmailHint")}</p>
              </form>
            </>
          )}

          <div className="text-center">
            <Link to="/" className="text-[11px] tracking-[0.2em] text-white/40 hover:text-white uppercase transition-colors">
              {getCopy(settings?.design, "accountBackToStore")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-fm-store data-studio-target="copy:Customer account|style:colors|style:accounts" data-studio-label="Account page" className="min-h-screen fm-page text-white relative overflow-hidden pb-24">
      <StorefrontThemeStyle design={settings?.design} />
      {/* Background glow */}
      <div {...regionProps("accountGlow")} className="fixed top-0 right-0 w-[600px] h-[600px] blur-[120px] rounded-full pointer-events-none -mr-64 -mt-64" style={{ backgroundColor: "rgba(var(--accent-rgb), 0.05)" }} />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-cyan-600/5 blur-[100px] rounded-full pointer-events-none" />

      <TitleBar {...regionProps("accountHeader")} className="border-b border-white/5 px-8 py-6 flex items-center justify-between backdrop-blur-xl relative z-20" style={{ backgroundColor: "rgba(var(--overlay-rgb), 0.2)" }}>
        <Link to="/" className="flex items-center gap-3 text-[10px] font-black tracking-[0.3em] text-white/40 hover:text-white transition-colors group uppercase">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> {getCopy(settings?.design, "accountStorefront")}
        </Link>
        <span className="text-[9px] font-black tracking-[0.4em] text-white/30 uppercase">{getCopy(settings?.design, "accountPortal")}</span>
        <button
          onClick={() => signOut(auth)}
          className="flex items-center gap-3 text-[10px] font-black tracking-[0.3em] text-white/40 hover:text-rose-400 transition-colors uppercase"
        >
          <LogOut size={14} /> {getCopy(settings?.design, "accountSignOut")}
        </button>
      </TitleBar>

      <main className="max-w-4xl mx-auto px-6 pt-16 relative z-10 space-y-12">
        
        {/* Customer Header Info */}
        <section {...regionProps("accountProfile")} className="glass-card rounded-[2.5rem] border border-white/5 p-8 flex items-center gap-6">
          {user.photoURL ? (
            <img loading="lazy" decoding="async" src={user.photoURL} className="w-16 h-16 rounded-full border border-white/10" alt="" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl font-black uppercase" style={{ color: "var(--accent)" }}>
              {(user.displayName || user.email || "?")[0]}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase italic">{user.displayName || profile?.name || getCopy(settings?.design, "accountTitle")}</h1>
            <p className="text-[10px] tracking-widest uppercase fm-muted font-mono mt-1">{user.email}</p>
          </div>
        </section>

        {/* Dashboard Vitals Grid */}
        <section {...regionProps("accountVitals")} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link {...regionProps("accountSaved")} to="/wishlist" className="glass-card border border-white/5 rounded-[2rem] p-8 hover:bg-white/[0.02] transition-colors flex flex-col gap-3 group">
            <Heart size={20} className="text-rose-400 group-hover:scale-110 transition-transform" />
            <div>
              <p className="text-[9px] font-black tracking-widest uppercase fm-muted">{getCopy(settings?.design, "accountWishlist")}</p>
              <p className="text-3xl font-black tracking-tight mt-1">{getCopy(settings?.design, "accountSaved", { count: wishlistCount })}</p>
            </div>
          </Link>

          <div {...regionProps("accountOrders")} className="glass-card border border-white/5 rounded-[2rem] p-8 flex flex-col gap-3">
            <Package size={20} style={{ color: "var(--accent)" }} />
            <div>
              <p className="text-[9px] font-black tracking-widest uppercase fm-muted">{getCopy(settings?.design, "accountOrders")}</p>
              <p className="text-3xl font-black tracking-tight mt-1">{getCopy(settings?.design, "accountTransacted", { count: orders.length })}</p>
            </div>
          </div>

          <div {...regionProps("accountAddress")} className="glass-card border border-white/5 rounded-[2rem] p-8 flex flex-col gap-3 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/[0.02] to-transparent pointer-events-none" />
            <MapPin size={20} className="text-cyan-400" />
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] font-black tracking-widest uppercase fm-muted">{getCopy(settings?.design, "accountShipping")}</p>
                <p className="text-[11px] font-bold text-white/75 leading-relaxed mt-2 uppercase tracking-wide">
                  {profile?.defaultAddress?.city
                    ? `${profile.defaultAddress.city}, ${profile.defaultAddress.country}`
                    : getCopy(settings?.design, "accountUnconfigured")}
                </p>
              </div>
              <button 
                onClick={() => (isEditingAddress ? closeAddressForm() : setIsEditingAddress(true))}
                className="text-[9px] font-black tracking-[0.25em] text-cyan-400 hover:text-cyan-300 uppercase shrink-0"
              >
                {getCopy(settings?.design, isEditingAddress ? "accountClose" : "accountManage")}
              </button>
            </div>
          </div>
        </section>

        {/* Address configuration form (drawer-like) */}
        {isEditingAddress && (
          <section {...regionProps("accountAddressForm")} className="glass-card border border-white/5 rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h3 className="text-xs font-black tracking-[0.4em] uppercase text-cyan-400">{getCopy(settings?.design, "accountAddressTitle")}</h3>
              <button onClick={closeAddressForm} className="text-[9px] font-black tracking-widest fm-muted hover:text-white uppercase">{getCopy(settings?.design, "accountAbort")}</button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="account-field-name" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldName")}</label>
                  <input
                    id="account-field-name"
                    autoComplete="name"
                    type="text"
                    required
                    value={addressForm.name}
                    onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="account-field-phone" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldPhone")}</label>
                  <input
                    id="account-field-phone"
                    autoComplete="tel"
                    type="text"
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    placeholder={getCopy(settings?.design, "accountPhonePlaceholder")}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="account-field-street" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldStreet")}</label>
                <input
                    id="account-field-street"
                    autoComplete="street-address"
                  type="text"
                  required
                  placeholder={getCopy(settings?.design, "accountStreetPlaceholder")}
                  value={addressForm.street}
                  onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <label htmlFor="account-field-city" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldCity")}</label>
                  <input
                    id="account-field-city"
                    autoComplete="address-level2"
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="account-field-state" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldState")}</label>
                  <input
                    id="account-field-state"
                    autoComplete="address-level1"
                    type="text"
                    required
                    value={addressForm.state}
                    onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="account-field-zip" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldZip")}</label>
                  <input
                    id="account-field-zip"
                    autoComplete="postal-code"
                    type="text"
                    required
                    value={addressForm.zip}
                    onChange={(e) => setAddressForm({ ...addressForm, zip: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all font-mono"
                  />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <label htmlFor="account-field-country" className="text-[9px] font-black fm-muted uppercase tracking-widest ml-1">{getCopy(settings?.design, "accountFieldCountry")}</label>
                  <input
                    id="account-field-country"
                    autoComplete="country-name"
                    type="text"
                    required
                    value={addressForm.country}
                    onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 px-6 text-xs text-white outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="submit"
                  disabled={savingAddress}
                  aria-busy={savingAddress}
                  className="disabled:opacity-60 bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-4 rounded-xl text-[9px] font-black tracking-[0.3em] uppercase transition-all shadow-lg shadow-cyan-600/10"
                >
                  {getCopy(settings?.design, "accountSaveAddress")}
                </button>
                <button
                  type="button"
                  onClick={closeAddressForm}
                  className="px-6 py-4 text-[9px] font-black tracking-widest fm-muted hover:text-white uppercase"
                >
                  {getCopy(settings?.design, "accountCancel")}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Order History Details View */}
        <section {...regionProps("accountHistory")} className="glass-card border border-white/5 rounded-[2.5rem] p-10">
          <h2 className="text-xs font-black tracking-[0.5em] text-white/30 uppercase mb-8">{getCopy(settings?.design, "accountHistory")}</h2>
          {loadingData ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="animate-spin" style={{ color: "var(--accent)" }} size={24} />
              <p className="text-[9px] font-black tracking-[0.3em] fm-muted uppercase">{getCopy(settings?.design, "accountHistoryLoading")}</p>
            </div>
          ) : ordersError && orders.length === 0 ? (
            <div role="alert" className="py-16 text-center space-y-4">
              <p className="text-white/60 text-xs font-bold tracking-widest uppercase">{getCopy(settings?.design, "accountHistoryError")}</p>
              <button type="button" onClick={() => user && loadCustomerData(user)} className="text-[10px] font-black uppercase tracking-[0.25em] fm-accent-text hover:underline">
                {getCopy(settings?.design, "accountHistoryRetry")}
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Package size={32} className="mx-auto fm-muted" strokeWidth={1.2} />
              <p className="text-white/40 text-xs font-bold tracking-widest uppercase">{getCopy(settings?.design, "accountHistoryEmpty")}</p>
            </div>
          ) : (
            <ul className="space-y-6">
              {orders.map(o => {
                const isExpanded = expandedOrderId === o.id;
                const orderDigitalAssets = digitalItems[o.id] || [];
                
                return (
                  <li key={o.id} className="glass-card border border-white/5 rounded-[2rem] overflow-hidden transition-all duration-300 hover:border-white/10">
                    {/* Collapsed header row */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                      onKeyDown={event => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setExpandedOrderId(isExpanded ? null : o.id);
                      }}
                      className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-6">
                        <div
                          className={`p-3 rounded-xl ${o.paymentStatus === 'paid' ? '' : 'bg-amber-500/5 text-amber-400'}`}
                          style={
                            o.paymentStatus === 'paid'
                              ? { backgroundColor: "rgba(var(--success-rgb), 0.05)", color: "var(--success)" }
                              : undefined
                          }
                        >
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-widest text-white">{o.orderId || o.id}</p>
                          <p className="text-[9px] tracking-widest fm-muted uppercase mt-1">
                            {new Date(o.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })} · {(() => { const copies = (o.items || []).reduce((n: number, i: any) => n + (Number(i.quantity) || 1), 0); return getCopy(settings?.design, copies === 1 ? "accountBookCountOne" : "accountBookCountMany", { count: copies }); })()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 self-stretch md:self-auto justify-between border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const tone = statusTone(o);
                            return (
                              <span
                                className={`text-[8px] font-black tracking-widest uppercase px-3.5 py-1.5 rounded-xl border ${
                                  tone === "success"
                                    ? ""
                                    : tone === "info"
                                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                                    : tone === "danger"
                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                }`}
                                style={
                                  tone === "success"
                                    ? {
                                        backgroundColor: "rgba(var(--success-rgb), 0.1)",
                                        color: "var(--success)",
                                        borderColor: "rgba(var(--success-rgb), 0.2)",
                                      }
                                    : undefined
                                }
                              >
                                {getCopy(settings?.design, statusCopyKey(o))}
                              </span>
                            );
                          })()}
                          <span
                            className={`text-[8px] font-black tracking-widest uppercase px-3.5 py-1.5 rounded-xl border ${
                              o.paymentStatus === 'paid'
                                ? ''
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                            style={
                              o.paymentStatus === 'paid'
                                ? {
                                    backgroundColor: "rgba(var(--success-rgb), 0.1)",
                                    color: "var(--success)",
                                    borderColor: "rgba(var(--success-rgb), 0.2)",
                                  }
                                : undefined
                            }
                          >
                            {getCopy(settings?.design, o.paymentStatus === "paid" ? "accountPaid" : o.paymentStatus === "refunded" ? "accountRefunded" : o.paymentStatus === "partially_refunded" ? "accountPartiallyRefunded" : "accountUnpaid")}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-black text-white font-mono">{orderChargedTotal(o, formatPrice)}</span>
                          {isExpanded ? <ChevronUp size={14} className="fm-muted" /> : <ChevronDown size={14} className="fm-muted" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded details container */}
                    {isExpanded && (
                      <div className="p-8 border-t border-white/5 bg-white/[0.01] space-y-8 animate-in fade-in duration-300">
                        <Link
                          {...regionProps("accountTrackOrder")}
                          to={trackLink(o)}
                          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] fm-accent-text hover:underline"
                        >
                          {getCopy(settings?.design, "accountTrackOrder")} →
                        </Link>
                        {(o.items?.length || 0) > 0 && (
                          <button
                            type="button"
                            {...regionProps("accountBuyAgain")}
                            onClick={() => buyAgain(o)}
                            className="ml-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] fm-accent-text hover:underline"
                          >
                            {getCopy(settings?.design, "accountBuyAgain")}
                          </button>
                        )}
                        
                        {/* E-book downloads section */}
                        {orderDigitalAssets.length > 0 && o.paymentStatus === 'paid' && (
                          <div {...regionProps("accountDownloads")}
                            className="border p-6 rounded-2xl space-y-4"
                            style={{ backgroundColor: "rgba(var(--accent-rgb), 0.08)", borderColor: "rgba(var(--accent-rgb), 0.2)" }}
                          >
                            <div>
                              <h4 className="text-xs font-black tracking-[0.3em] uppercase" style={{ color: "var(--accent)" }}>{getCopy(settings?.design, "accountDigitalTitle")}</h4>
                              <p className="text-[10px] fm-muted mt-1 leading-relaxed">{getCopy(settings?.design, "accountDigitalText")}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {orderDigitalAssets.map((item) => {
                                // One download per book and edition (box-set parts included).
                                return (
                                  <div key={`${item.itemId}|${item.variantId}`} className="fm-surface-2 border border-white/5 rounded-xl p-4 flex justify-between items-center">
                                    <div className="truncate pr-4">
                                      <p className="text-[10px] font-bold text-white uppercase truncate">{item.title}</p>
                                      <p className="text-[8px] fm-muted uppercase tracking-widest mt-1">{getCopy(settings?.design, "accountEbook")}</p>
                                    </div>
                                    <button
                                      onClick={() => handleDownloadDigitalAsset(o, item.itemId, item.variantId)}
                                      className="text-white p-2.5 rounded-lg transition-all flex items-center justify-center shrink-0 active:scale-95"
                                      style={{ backgroundColor: "var(--accent)" }}
                                      title={getCopy(settings?.design, "accountDownload")}
                                      aria-label={getCopy(settings?.design, "accountDownload")}
                                    >
                                      <Download size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Line items details */}
                        <div className="space-y-4">
                          <h4 className="text-[9px] font-black tracking-widest fm-muted uppercase">{getCopy(settings?.design, "accountItems")}</h4>
                          <div className="space-y-3">
                            {o.items?.map((item: any, idx: number) => (
                              <div key={idx} className="flex gap-4 items-center">
                                <div className="w-10 aspect-[3/4] fm-surface rounded-md overflow-hidden border border-white/5 shrink-0">
                                  <img loading="lazy" decoding="async" src={item.photoUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-grow min-w-0">
                                  <p className="text-[11px] font-black text-white uppercase tracking-wider truncate">{item.title}</p>
                                  {orderLineNotes(item, (k, v) => getCopy(settings?.design, k, v), "account").length > 0 && (
                                    <ul {...regionProps("accountLineDetails")} className="list-none p-0 m-0 mt-1">
                                      {orderLineNotes(item, (k, v) => getCopy(settings?.design, k, v), "account").map((note, n) => <li key={n} className="text-[9px] fm-muted font-mono">{note}</li>)}
                                    </ul>
                                  )}
                                  <p className="text-[9px] fm-muted font-mono mt-1">{getCopy(settings?.design, "qtyLine", { qty: item.quantity })} × {money(item.price, o)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Delivery logistics tracking details */}
                        {o.trackingNumber && (
                          <div {...regionProps("accountShipment")} className="bg-cyan-950/20 border border-cyan-500/15 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                              <p className="text-[9px] font-black tracking-[0.3em] text-cyan-400 uppercase">{getCopy(settings?.design, "accountDispatch")}</p>
                              <p className="text-xs font-mono fm-muted mt-2">
                                {getCopy(settings?.design, "carrierLabel")} {o.trackingCarrier} <span className="mx-2 fm-muted">|</span> {getCopy(settings?.design, "trackingCodeLabel")} {o.trackingNumber}
                              </p>
                            </div>
                            <a 
                              href={getTrackingUrl(o.trackingCarrier, o.trackingNumber, o.trackingUrl)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-6 py-3 fm-active hover:bg-slate-200 text-[9px] font-black tracking-widest uppercase rounded-xl transition-all flex items-center gap-2 shadow-lg"
                            >
                              {getCopy(settings?.design, "accountTrackPackage")} <ExternalLink size={12} />
                            </a>
                          </div>
                        )}

                        {/* Order breakdown summary */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5 text-[11px] fm-muted">
                          <div className="space-y-1">
                            <p className="text-[9px] font-black tracking-widest fm-muted uppercase">{getCopy(settings?.design, "accountShipTo")}</p>
                            <p className="text-xs text-white/60 font-bold uppercase leading-relaxed mt-1">
                              {o.customer?.name}<br/>
                              {o.customer?.address?.street}<br/>
                              {o.customer?.address?.city}, {o.customer?.address?.state} {o.customer?.address?.zip}<br/>
                              {o.customer?.address?.country}
                            </p>
                          </div>

                          <div className="space-y-3 font-semibold fm-muted">
                            <div className="flex justify-between">
                              <span className="uppercase text-[9px] tracking-widest fm-muted">{getCopy(settings?.design, "summarySubtotal")}</span>
                              <span className="font-mono text-white/80">{money(o.subtotal, o)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="uppercase text-[9px] tracking-widest fm-muted">{getCopy(settings?.design, "accountLogisticsFee")}</span>
                              <span className="font-mono text-white/80">{money(o.shipping, o)}</span>
                            </div>
                            {o.discount > 0 && (
                              <div className="flex justify-between fm-success-text">
                                <span className="uppercase text-[9px] tracking-widest">{getCopy(settings?.design, "summaryDiscount")}</span>
                                <span className="font-mono">-{money(o.discount, o)}</span>
                              </div>
                            )}
                            {o.tax > 0 && (
                              <div className="flex justify-between">
                                <span className="uppercase text-[9px] tracking-widest fm-muted">{getCopy(settings?.design, "summaryTax")}</span>
                                <span className="font-mono text-white/80">{money(o.tax, o)}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-white/5 pt-3 text-white font-black">
                              <span className="uppercase text-[9px] tracking-widest text-white/30">{getCopy(settings?.design, "summaryTotal")}</span>
                              <span className="font-mono text-base">{orderChargedTotal(o, formatPrice)}</span>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <TemplateSections design={settings?.design} templateId="accountPage" books={books} />
      <GlobalSections design={settings?.design} books={books} />
    </div>
  );
}
