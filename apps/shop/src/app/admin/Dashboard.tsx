import "../../styles/adminCompat.css";
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { isShopOwner, markOwnerDeviceOnSignIn } from "../lib/ownerDevice";
// `m` + the app-wide LazyMotion (domAnimation): the full `motion` component would pull layout/drag code into the shop's first load.
import { m, AnimatePresence } from "motion/react";
import {
  BookOpen, LogOut, History, Globe, Menu, HelpCircle, Compass, Sun, Moon, ChevronDown, Store,
} from "lucide-react";

import { Login } from "./Login";
import { ordersNeedingWork, refreshOrdersCache } from "./ordersStore";
import { AlertsPill, useAlertDismissals, visibleAlerts } from "./AdminAlerts.tsx";
import { AdminPageBoundary } from "./AdminPageBoundary";
import { shopErrorAlert, shopErrorRows } from "./shopErrors";
import { backupAlert, billHeadsUpAlert, buildAdminAlerts, cardAccountAlert, checkFailedAlert, inventoryLinkAlerts, settingsAlerts, type AdminAlert, type AlertRoute } from "./adminAlerts";
import type { PlatformPaymentsAnswer } from "./platformPayments";
import { hasStockroom, platformCardsProvider, runsOnColophon } from "../../lib/shopProfile";
import { googleConnectApi } from "./googleConnect";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { inventoryLinkView, setInventoryLink, type AppBookEntry } from "./appSwitch";
import { AppSwitcher, AppSwitchPill, useWebsiteTabName } from "./AppSwitcher";
import { getOrdersCached, peekOrders, setOrdersLoader } from "./ordersCache";
import { anyDirty, useBeforeUnloadWhenDirty } from "./settingsDirty";
import { adminApi } from "./api";
import { scrubSavedSecrets } from "./privateKeys";
import toast from "react-hot-toast";
import {
  AppShell, Sidebar, Topbar, PageHeader, PageTabs, Breadcrumbs, PrimaryButton, SecondaryButton,
  IconButton, Dialog, ToastProvider, SyncChip, useOnline, LoadingState, PageSkeleton, useConfirm, PageAlertsSlot, PageActionsSlot, PageHeadSlot, BackLink, type PageHeadOverride,
} from "./riso/components";
import { GlobalSearch, ActivityLogDialog, ShopStatusMenu, DrawerAccount, StoreSwitcher } from "./riso/shellParts";
import { blockedMessage, blockersBeforeOpening, openButtonLabel } from "./launchCheck";
import { WhatsNew } from "./WhatsNew";
import { applyAdminLook } from "./riso/adminLook";
import { SupportBanner } from "./SupportBanner";
import { PlanBannerBar } from "./PlanBanner";
// Home shows its own closing tile for a cancelled plan, so the banner stays off there (overview/ClosingTile.tsx).
import { closingDay } from "./overview/ClosingTile";
import { TwoStepReminder } from "./TwoStepReminder";
import type { ReadinessItem } from "./launchReadiness";
import { LaunchChecklist } from "./LaunchChecklist";
import { addStorePage, askPersonPage, planLocked, storesPage, trialPill } from "./platformPlan";
import { usePlatformPlan } from "./platformPlanApi";
import { PlatformMessagesBar } from "./PlatformMessagesBar";
import { LocalBackupAuto } from "./LocalBackupCard";
// Automatic invoice reminders run in the owner's open combined admin (stockroom/autoRemind.ts); loaded only there.
const AlertsPage = lazy(() => import("./AlertsPage").then(m => ({ default: m.AlertsPage })));
const HelpPage = lazy(() => import("./HelpPage").then(m => ({ default: m.HelpPage })));
const AutoReminders = lazy(() => import("./stockroom/AutoReminders").then((m) => ({ default: m.AutoReminders })));
import type { SupportVisit } from "./supportSession";
import { parseStudioLocation, type StudioLocation } from "../lib/studioLocation";
import { useAdminAppManifest } from "./adminApp";
import { shopNameFromSettings, wordmarkWords } from "../features/site/shopIdentity";
import { adminWordsFor, currentSells } from "./sells";
import { SELLS_CHANGED_EVENT, ShopSellsContext, ShopWordsContext } from "./shopWords";
import { hasPublisherTools } from "../../shared/shopSells";
import { COMBINED_MENU, FAIR_MENU, MENU, NAV, PAGE_COPY, SETTINGS_ITEM_PREFIX, itemSections, menuItemFor, sideMenu, sideOf, sidebarItems, withoutPages } from "./riso/nav";
import { FairCard, SideSwitch, rememberFair, rememberSide, rememberedFair, rememberedSide } from "./SideSwitch";
import { PhoneNav } from "./PhoneNav";
import { useStockroomTodos } from "./overview/StockroomTodos";
import { COMBINED_PAGES, DEFAULT_STOCKROOM_PAGE, REORDER_TAB, SALES_TAB, isCombinedTab, STOCKROOM_ITEM_PREFIX, STOCKROOM_PAGES, STOCKROOM_TAB, combinedAdmin, stockroomPage } from "./combined";
import { keepAdminOffline } from "./adminOffline";
import { AdminTour, type TourPhase } from "./walkthrough/AdminTour";
import { markTourSeen, tourFor, tourSeen } from "./walkthrough/tourSteps";
import { markTourSeenOnAccount, tourSeenOnAccount } from "./walkthrough/tourStore";
import { stockroomBridge } from "./stockroomBridge";
import { NATIVE_PAGES } from "./stockroom/nativePages";
import { OVERVIEW_HASH_EVENT, adminDocumentTitle, hashForRoute, keepsSubTab, routeFromHash, sameSection, searchFromHash, settingsPageOf, subTabPage } from "./adminRoute";
import { setProductSells } from "../lib/productHref";

// Studio is large and only opened from Settings › Design, so it loads in its own chunk.
const StudioEditor = lazy(() => import("./studio/StudioWorkspace").then(m => ({ default: m.StudioWorkspace })));
// Heavy admin pages load in their own chunks when first opened.
const BookEditor = lazy(() => import("./BookEditor").then(m => ({ default: m.BookEditor })));
const FairHelperDesk = lazy(() => import("./FairHelperDesk").then(m => ({ default: m.FairHelperDesk })));
const FairHelperInbox = lazy(() => import("./stockroom/FairHelperInbox").then(m => ({ default: m.FairHelperInbox })));
const WebsiteOrdersAuto = lazy(() => import("./stockroom/WebsiteOrders").then(m => ({ default: m.WebsiteOrdersAuto })));
const StockroomCopyAuto = lazy(() => import("./stockroom/StockroomCopies.tsx").then(m => ({ default: m.StockroomCopyAuto })));
const Discounts = lazy(() => import("./Discounts").then(m => ({ default: m.Discounts })));
const GiftCards = lazy(() => import("./GiftCards").then(m => ({ default: m.GiftCards })));
const SalesChannels = lazy(() => import("./SalesChannels").then(m => ({ default: m.SalesChannels })));
const SocialPosts = lazy(() => import("./SocialPosts").then(m => ({ default: m.SocialPosts })));
const DesignHome = lazy(() => import("./DesignHome").then(m => ({ default: m.DesignHome })));
const Customers = lazy(() => import("./Customers").then(m => ({ default: m.Customers })));
const BookCatalog = lazy(() => import("./BookCatalog").then(m => ({ default: m.BookCatalog })));
const AllSales = lazy(() => import("./AllSales").then(m => ({ default: m.AllSales })));
const ReorderList = lazy(() => import("./ReorderPanel").then(m => ({ default: m.ReorderList })));
const BookkeeperDesk = lazy(() => import("./BookkeeperDesk").then(m => ({ default: m.BookkeeperDesk })));
const PlanDesk = lazy(() => import("./PlanParts").then(m => ({ default: m.PlanDesk })));
const Inventory = lazy(() => import("./Inventory").then(m => ({ default: m.Inventory })));
const OrdersDesk = lazy(() => import("./OrdersDesk.tsx").then(m => ({ default: m.OrdersDesk })));
const AnalyticsPage = lazy(() => import("./analytics/AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const HomePage = lazy(() => import("./overview/HomePage").then(m => ({ default: m.HomePage })));
const ShopSettings = lazy(() => import("./ShopSettings").then(m => ({ default: m.ShopSettings })));
const ReviewsModeration = lazy(() => import("./ReviewsModeration"));
const Messages = lazy(() => import("./Messages"));

// Every shared orders load also refreshes the Orders list memory (its instant return and "Ship orders").
setOrdersLoader(() => refreshOrdersCache({ incremental: true }));
// Alerts and badges: checked every 5 minutes while the admin is on screen; an orders copy under 4.5 minutes old
// (the Orders desk refreshes it every minute) is reused, an older one is read again.
const ALERT_CHECK_MS = 5 * 60 * 1000;
const ALERT_ORDERS_MAX_AGE_MS = 4.5 * 60 * 1000;

const openSite = () => {
  const adminIdx = window.location.pathname.toLowerCase().indexOf("/admin");
  const basePath = adminIdx !== -1 ? window.location.pathname.substring(0, adminIdx) : "";
  window.open(window.location.origin + basePath + "/", "_blank", "noopener");
};

// The page in the address bar when the admin first opens (reload, Back, a copied or emailed link).
function readBootRoute() {
  const hash = window.location.hash;
  const studio = parseStudioLocation(hash);
  if (studio) return { tab: "settings", settingsTab: "designer", studio };
  const route = routeFromHash(hash);
  // `#stockroom/…` belongs to the combined admin only (shop + stockroom plan).
  const usable = route && ((route.tab !== STOCKROOM_TAB && !isCombinedTab(route.tab)) || COMBINED);
  return { ...(usable ? route : { tab: "overview" }), studio: null as StudioLocation | null };
}

// One admin for a press with both apps (combined.ts): one menu, the stockroom's pages inside, no app switcher.
const COMBINED = combinedAdmin();
const ADMIN_MENU = COMBINED ? COMBINED_MENU : MENU;
// Whether the admin was opened with no page in its address (read once, before the admin writes one).
const OPENED_WITHOUT_PAGE = typeof window !== "undefined" && !window.location.hash.replace(/^#/, "");

export function Dashboard() {
  const online = useOnline();
  useAdminAppManifest();
  // The combined admin keeps an offline copy, so the fair till opens with no signal (adminOffline.ts); built sites only.
  useEffect(() => { if (import.meta.env.PROD) void keepAdminOffline(COMBINED); }, []);
  useWebsiteTabName();
  const [boot] = useState(readBootRoute);
  const [activeTab, setActiveTab] = useState(boot.tab);
  // A sub-page (v4 New discount, Add an expense) swaps in its own title and Back link while it is open (PageHead).
  const [headOverride, setHeadOverride] = useState<PageHeadOverride | null>(null);
  // "Open in the stockroom" from another page shows that stockroom page (set below, after the page helpers).
  const openStockroomRef = useRef<(page: string, bookId?: string) => void>(() => {});
  useEffect(() => (COMBINED ? stockroomBridge.onOpen((page, extra) => openStockroomRef.current(page, extra?.book)) : undefined), []);
  const [user, setUser] = useState<any>(null);
  // Signed in with the Team's bookkeeper role: the Bookkeeping page instead of the admin.
  const [bookkeeper, setBookkeeper] = useState<{ email: string | null } | null>(null);
  // Signed in with the Team's fair helper role: the Fair till instead of the admin (FairHelperDesk.tsx).
  const [fairHelper, setFairHelper] = useState<{ email: string } | null>(null);
  // Platform support signed in from the platform's control room (supportSession.ts); null for everyone else.
  const [supportVisit, setSupportVisit] = useState<SupportVisit | null>(null);
  // The shop's plan on the platform (platform/plan, plan 6.6): banners, and a paused or closed plan opens on Plan &
  // billing only (PlanDesk). Followed live, so a card added on Plan & billing opens the admin again by itself.
  const { plan: platformPlan } = usePlatformPlan(!!user);
  const [loading, setLoading] = useState(true);
  const [editingBook, setEditingBook] = useState<any | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [studioLocation, setStudioLocation] = useState<(StudioLocation & { key: number }) | null>(boot.studio ? { ...boot.studio, key: 1 } : null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(boot.orderId ? { id: boot.orderId } : null);
  const [openGiftCard, setOpenGiftCard] = useState<string | null>(boot.giftCardId || null);
  // A post started from a book (`#social-posts/book/<id>`): the composer opens with that product.
  const [postBook, setPostBook] = useState<string | null>(boot.tab === "socialPosts" ? boot.bookId || null : null);
  const [settingsTab, setSettingsTab] = useState(boot.settingsTab || "general");
  // The open sub tab of a page split into sub tabs (General, Payments, Email sender, Shipping, Inventory), with the
  // page it belongs to: any other page shows its first tab, so leaving a page and coming back starts on its first tab.
  const [subTabState, setSubTabState] = useState<{ page: string; id?: string }>({ page: subTabPage(boot), id: boot.subTab });
  const subPage = subTabPage({ tab: activeTab, settingsTab });
  const subTab = subTabState.page === subPage ? subTabState.id : undefined;
  /** Opens a sub tab (`undefined` = the first) on the page on screen, or on `page` when a link opens another page too. */
  const openSubTab = (id: string | undefined, page: string = subPage) => setSubTabState({ page, id });
  // The book a stockroom page was opened for (a to-do line's fix button): kept with the page it was meant for, so any
  // other way to a stockroom page (the menu, Back) opens it without one.
  const [stockroomFocus, setStockroomFocus] = useState<{ page: string; bookId: string } | null>(null);
  useEffect(() => {
    if (subTabState.page !== subPage) setSubTabState({ page: subPage });
  }, [subPage]);
  // The hash this page last read or wrote, so its own address changes are not applied twice.
  const lastHash = useRef(window.location.hash);
  // Links from the inventory app's search: `#search=<text>` opens the admin search, `#catalog/book/<id>` a book.
  const [searchRequest, setSearchRequest] = useState<{ q: string; n: number } | null>(null);
  const [appSearch, setAppSearch] = useState<{ books: AppBookEntry[] | null; connected: boolean }>({ books: null, connected: false });
  const openBookById = useRef<(id: string) => void>(() => {});
  const [bookLinkProblem, setBookLinkProblem] = useState<string | null>(null);
  // Back/Forward must not close the book editor or Studio underneath unsaved work.
  const takeoverOpen = useRef(false);
  takeoverOpen.current = showEditor || (activeTab === "settings" && settingsTab === "designer");
  // The admin page lives in the address bar: /admin#orders/<id>, /admin#settings/payments, /admin#designer?….
  // Reload, Back/Forward and links from emails, What's new and the book editor all open the page they name.
  useEffect(() => {
    if (!user) return;
    const openFromHash = () => {
      const hash = window.location.hash;
      if (hash === lastHash.current) return;
      const studio = parseStudioLocation(hash);
      if (takeoverOpen.current && !studio) {
        // Put the address back rather than closing an editor that may hold unsaved changes.
        history.pushState(null, "", window.location.pathname + window.location.search + lastHash.current);
        return;
      }
      const search = searchFromHash(hash);
      if (search) {
        // Open the search over the page on screen, and put that page's address back.
        setSearchRequest({ q: search, n: Date.now() });
        history.replaceState(null, "", window.location.pathname + window.location.search + lastHash.current);
        return;
      }
      lastHash.current = hash;
      if (studio) {
        setShowEditor(false);
        setStudioLocation({ ...studio, key: Date.now() });
        setActiveTab("settings");
        setSettingsTab("designer");
        return;
      }
      const route = routeFromHash(hash);
      if (!route || ((route.tab === STOCKROOM_TAB || isCombinedTab(route.tab)) && !COMBINED)) return;
      setShowEditor(false);
      setActiveTab(route.tab);
      if (route.settingsTab) setSettingsTab(route.settingsTab);
      setSubTabState({ page: subTabPage(route), id: route.subTab });
      setSelectedOrder(route.orderId ? { id: route.orderId } : null);
      setOpenGiftCard(route.giftCardId || null);
      if (route.tab === "socialPosts") setPostBook(route.bookId || null);
      else if (route.bookId) openBookById.current(route.bookId);
    };
    // The Overview names its sub tab in the address itself; remember it as seen.
    const overviewWrote = () => { lastHash.current = window.location.hash; };
    // The admin opened from one of those links (the boot route already chose the page).
    const bootSearch = searchFromHash(window.location.hash);
    if (bootSearch) setSearchRequest({ q: bootSearch, n: Date.now() });
    if (boot.bookId && boot.tab !== "socialPosts") openBookById.current(boot.bookId);
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    window.addEventListener("popstate", openFromHash);
    window.addEventListener(OVERVIEW_HASH_EVENT, overviewWrote);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      window.removeEventListener("popstate", openFromHash);
      window.removeEventListener(OVERVIEW_HASH_EVENT, overviewWrote);
    };
  }, [user]);

  // Write the page on screen back to the address bar. A new page adds a Back step; switching
  // between orders or sub tabs, or tidying a link that already opened this page, replaces it.
  useEffect(() => {
    if (!user) return;
    const next = hashForRoute({ tab: activeTab, settingsTab, subTab, orderId: activeTab === "orders" ? selectedOrder?.id : undefined });
    const current = window.location.hash;
    // The Overview keeps its own sub tab after the page name (#overview/visitors/move).
    if (current === next || keepsSubTab(current, next)) { lastHash.current = current; return; }
    const currentRoute = routeFromHash(current);
    const replace = !current || sameSection(current, next)
      || (currentRoute ? hashForRoute(currentRoute) === next : !parseStudioLocation(current) || next === "#designer");
    const url = window.location.pathname + window.location.search + next;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    lastHash.current = next;
  }, [user, activeTab, settingsTab, subTab, selectedOrder?.id]);

  // Orders waiting on the publisher, shown as a badge on the Orders nav item.
  const [ordersBadge, setOrdersBadge] = useState(0);
  const bootOrdersRead = useRef(false);
  const refreshAlertsRef = useRef<() => void>(() => {});
  // Unpaid/mismatched/disputed orders etc., shown above every admin page.
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  // The stockroom's automatic runs (reminders, repeating invoices, bills due) each hand an alert by its id; one never hides another.
  const [reminderAlerts, setReminderAlerts] = useState<Record<string, AdminAlert>>({});
  const addReminderAlert = (a: AdminAlert) => setReminderAlerts((m) => ({ ...m, [a.id]: a }));
  // The alerts hidden in this browser (AdminAlerts.tsx), shared by the top bar's pill and the Alerts page.
  const alertHides = useAlertDismissals();
  // Pending reviews, unread messages and open privacy requests (cheap server counts).
  // QuickBooks lives in Settings › Apps (Julian, 12 November 2026), so its old page is on no menu. Settings › Google is
  // asked about once, the first time Settings opens (its pages are listed there only).
  const [googleOn, setGoogleOn] = useState(() => runsOnColophon());
  const googleAsked = useRef(false);
  useEffect(() => {
    if (activeTab !== "settings" || googleAsked.current) return;
    googleAsked.current = true;
    // Settings › Google lists only on a shop Colophon runs (or one with the platform's Google link); others keep the
    // older Analytics and Search Console cards in Visitors & Google.
    googleConnectApi.status().then((g) => setGoogleOn(g !== "not_available" || runsOnColophon())).catch(() => setGoogleOn(runsOnColophon()));
  }, [activeTab]);
  // The Stockroom side's count on the switch: the stockroom's to-dos, as Home counts them (overview/StockroomTodos.tsx).
  const stockroomTodos = useStockroomTodos(COMBINED);
  // The side you were last on (SideSwitch.tsx): kept on this device, and the admin reopens there when it is opened
  // with no page in its address (a press at a fair lands on the stockroom, not the website's Home).
  const sideNow = activeTab === STOCKROOM_TAB || activeTab === "inventory" ? "stockroom" : "website";
  useEffect(() => { if (COMBINED && user) rememberSide(sideNow); }, [sideNow, user]);
  const reopenedSide = useRef(false);
  useEffect(() => {
    if (!COMBINED || !user || reopenedSide.current) return;
    reopenedSide.current = true;
    if (OPENED_WITHOUT_PAGE && rememberedSide() === "stockroom") window.location.hash = hashForRoute({ tab: STOCKROOM_TAB, subTab: DEFAULT_STOCKROOM_PAGE });
  }, [user]);
  // What the shop sells (plan 10.23): sign-up's answer in `firstWeek/start`. A shop that doesn't sell books reads
  // "Products" for "Books" across the admin (sells.ts `adminWordsFor`); with no answer every word stays as it is.
  const [sellsAnswer, setSellsAnswer] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    Promise.resolve().then(() => adminApi.getFirstWeek()).then((doc) => setSellsAnswer(currentSells(doc))).catch(() => {});
  }, [user]);
  useEffect(() => {
    const on = (e: Event) => setSellsAnswer(String((e as CustomEvent).detail || "") || null);
    window.addEventListener(SELLS_CHANGED_EVENT, on);
    return () => window.removeEventListener(SELLS_CHANGED_EVENT, on);
  }, []);
  // Bookkeeping › Artist payouts is a book shop's (or a mixed one's); other shops never see the tab.
  const hiddenPages = new Set([...(googleOn ? [] : [SETTINGS_ITEM_PREFIX + "google"]), ...(runsOnColophon() ? [] : [SETTINGS_ITEM_PREFIX + "apps"]),
    ...(hasPublisherTools(sellsAnswer) ? [] : [STOCKROOM_ITEM_PREFIX + "artists"])]);
  // Product addresses follow the same answer: /products/<slug> in a shop that doesn't sell books (lib/productHref.ts).
  setProductSells(sellsAnswer);
  const w = adminWordsFor(sellsAnswer);
  const nav = useMemo(() => NAV.map((n) => ({ ...n, label: w(n.label) })), [w]);
  // The page the owner was on before opening Help, so Help can show answers about it first.
  const helpFrom = useRef<{ page: string; label: string } | null>(null);
  useEffect(() => {
    if (activeTab === "help") return;
    if (activeTab === "settings") {
      const child = NAV.find((n) => n.id === "settings")?.children?.find((c) => c.id === settingsTab);
      helpFrom.current = { page: SETTINGS_ITEM_PREFIX + settingsTab, label: w(child?.label || "Settings") };
    } else if (activeTab === STOCKROOM_TAB) {
      const sp = stockroomPage(subTab);
      helpFrom.current = sp ? { page: STOCKROOM_ITEM_PREFIX + sp.id, label: w(sp.label) } : null;
    } else {
      const item = NAV.find((n) => n.id === activeTab);
      helpFrom.current = item ? { page: activeTab, label: w(item.label) } : null;
    }
  }, [activeTab, settingsTab, subTab]);
  const [otherBadges, setOtherBadges] = useState<{ pendingReviews: number | null; unreadMessages: number | null; openPrivacyRequests: number | null }>({ pendingReviews: null, unreadMessages: null, openPrivacyRequests: null });
  const [searchCustomerQuery, setSearchCustomerQuery] = useState<string | undefined>(undefined);
  // What the last check read besides the orders (Stripe webhook, email log, backup, inventory link), so opening or
  // closing an order re-counts the badge and alerts from memory without reading any of it again.
  const alertInputs = useRef<{ webhook: any; emailLog: any[]; backup: any; linkState: any; shopErrors: any[]; cardAccount: PlatformPaymentsAnswer | null; failedParts: string[] } | null>(null);
  const showAlerts = (data: any[]) => {
    const inputs = alertInputs.current;
    if (!inputs) return;
    setOrdersBadge(ordersNeedingWork(data));
    const backupNote = backupAlert(inputs.backup);
    const note = checkFailedAlert(inputs.failedParts);
    const errorsNote = shopErrorAlert(shopErrorRows(inputs.shopErrors));
    const cardNote = cardAccountAlert(inputs.cardAccount);
    setAlerts([...(cardNote ? [cardNote] : []), ...buildAdminAlerts(data, inputs.webhook, Date.now(), inputs.emailLog), ...inventoryLinkAlerts(inputs.linkState), ...(backupNote ? [backupNote] : []), ...(errorsNote ? [errorsNote] : []), ...(note ? [note] : [])]);
  };
  useEffect(() => {
    if (!user) return;
    let alive = true;
    let lastCheck = 0;
    bootOrdersRead.current = true;
    // `maxAgeMs`: how old a shared orders copy may be and still count (0 = read again). The Orders desk keeps that
    // copy fresh while it is open, so the 5-minute check usually needs no order reads of its own.
    const refresh = (maxAgeMs?: number) => {
      lastCheck = Date.now();
      adminApi.getAdminBadgeCounts().then((c) => { if (alive) setOtherBadges(c); }).catch(() => {});
      return getOrdersCached({ maxAgeMs })
        .then(async (data) => {
          const failedParts: string[] = [];
          const [webhook, emailLog, backup, linkState, shopErrors, cardAccount] = await Promise.all([
            adminApi.getStripeWebhookStatus({ strict: true }).catch(() => { failedParts.push(`the payment status`); return null; }),
            adminApi.getRecentEmailLog(50).catch(() => { failedParts.push("the email log"); return []; }),
            adminApi.getBackupStatus().catch(() => { failedParts.push("the backup status"); return undefined; }),
            // A website-only press has no stockroom to link, so there is nothing to read (and nothing to fail).
            hasStockroom() ? inventoryLinkApi.state().catch(() => { failedParts.push("the inventory app link"); return null; }) : Promise.resolve(null),
            adminApi.getClientErrors(20).catch(() => { failedParts.push("the shop errors"); return []; }),
            // Cards through Colophon: is anything on the press's Stripe account past its deadline? (plan 7.9)
            platformCardsProvider() === "stripe" ? adminApi.platformPayments("status").catch(() => null) : Promise.resolve(null),
          ]);
          if (!alive) return;
          alertInputs.current = { webhook, emailLog, backup, linkState, shopErrors, cardAccount, failedParts };
          // The switcher's count; an unreadable link state keeps the last count rather than inventing one.
          if (linkState) {
            setInventoryLink(inventoryLinkView(linkState));
            setAppSearch({ books: Array.isArray(linkState.appBookIndex?.items) ? linkState.appBookIndex.items : null, connected: linkState.connection?.ok === true });
          }
          showAlerts(data);
        })
        // The orders themselves could not be read: say so instead of leaving a stale or empty list.
        .catch(() => { if (alive) setAlerts((prev) => [...prev.filter((a) => a.id !== "alerts-check-failed"), checkFailedAlert(["your orders"])!]); });
    };
    refreshAlertsRef.current = () => { void refresh(0); };
    refresh();
    // Every 5 minutes while the admin is on screen. A hidden tab reads nothing and checks on return once 5 minutes
    // have passed (the Orders desk does the same), so a tab left open in the background costs no reads.
    const check = () => { if (!document.hidden && Date.now() - lastCheck >= ALERT_CHECK_MS) void refresh(ALERT_ORDERS_MAX_AGE_MS); };
    const timer = window.setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [user]);
  // Returning from an order re-counts from the shared copy (the order page patches it), so finished work drops
  // off the badge without re-reading orders, the email log or the status documents.
  useEffect(() => {
    if (!user || selectedOrder !== null) return;
    const data = peekOrders();
    if (data) showAlerts(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedOrder === null]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Fair mode (v3 mockups): the rail shows only the Till and its shortcuts. Kept on this device until ended.
  const [fairMode, setFairMode] = useState(() => COMBINED && rememberedFair());
  const [settings, setSettings] = useState<any>(null);
  const [originalSettings, setOriginalSettings] = useState<any>(null);
  // The rail's wordmark: the shop's own name (plan 1.16), first word then the rest in italics.
  const brandWords = wordmarkWords(shopNameFromSettings(settings));
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuBtn = useRef<HTMLButtonElement>(null);
  // Opening the administrator menu moves focus to its first item (like riso ActionMenu).
  useEffect(() => {
    if (userMenuOpen) userMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [userMenuOpen]);
  // The spot in the page header where a page's main buttons go (PageActions in riso/components.tsx).
  const [pageActionsEl, setPageActionsEl] = useState<HTMLDivElement | null>(null);
  // The admin walkthrough (walkthrough/AdminTour.tsx): its welcome opens by itself the first time an owner opens the
  // admin (not seen on this device or on the shop's account), and Help or the account menu bring it back any time.
  const [tourPhase, setTourPhase] = useState<TourPhase | null>(null);
  const endTour = () => { markTourSeen(); void markTourSeenOnAccount(); };
  useEffect(() => {
    if (!user || tourSeen()) return;
    let alive = true;
    void tourSeenOnAccount().then((seen) => {
      if (!alive) return;
      if (seen) markTourSeen();
      else setTourPhase((p) => p ?? { kind: "welcome" });
    });
    return () => { alive = false; };
  }, [user]);

  const [adminTheme, setAdminTheme] = useState(() => {
    // Reso is the admin's primary design, not an optional storefront skin.
    // A versioned preference moves existing installs off the legacy dark UI
    // once while still letting an administrator deliberately choose dark mode.
    return localStorage.getItem("adminThemeReso") || "light";
  });

  applyAdminLook();

  const toggleTheme = () => {
    const newTheme = adminTheme === "dark" ? "light" : "dark";
    setAdminTheme(newTheme);
    localStorage.setItem("adminThemeReso", newTheme);
  };

  useEffect(() => {
    // Local development only: ?debug=true shows the admin without signing in. Production builds drop it
    // (Firestore rules would refuse every read anyway, but the shell must never pretend to be signed in).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "true") {
      setUser({
        displayName: "Debug Admin",
        email: "owner@example.com",
        photoURL: null
      });
      setLoading(false);
      loadSettings();
      return;
    }

    // A #support= link from the platform's control room signs support in (supportSession.ts).
    void adminApi.startSupportVisit();
    const unsubscribe = adminApi.onAuthStateChange(async (u) => {
      setSupportVisit(null);
      // The Team's bookkeeper gets the read-only Bookkeeping page, never the admin (BookkeeperDesk.tsx, plan 7.17).
      const books = u ? await Promise.resolve(adminApi.bookkeeperSignIn?.()).catch(() => null) : null;
      if (books) {
        setBookkeeper(books);
        setUser(null);
        setLoading(false);
        return;
      }
      setBookkeeper(null);
      const helper = u ? await Promise.resolve(adminApi.fairHelperSignIn?.()).catch(() => null) : null;
      setFairHelper(helper ?? null);
      if (helper) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(u);
      if (!u) { setLoading(false); return; }
      void adminApi.supportVisit().then(setSupportVisit).catch(() => setSupportVisit(null));
      loadSettings();
      // The server tells the admin the owner's address (lib/ownerDevice.ts); wait for it, briefly, so the owner's own
      // orders stay out of the first figures. Offline, the admin opens anyway after a few seconds.
      const known = Promise.resolve(adminApi.learnShopOwner?.()).catch(() => null);
      void Promise.race([known, new Promise(resolve => setTimeout(resolve, 4000))]).finally(() => {
        // The owner's own browsers never count as shop traffic (Settings › General › Your own visits).
        if (isShopOwner(u.email)) markOwnerDeviceOnSignIn();
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  const [ucSaving, setUcSaving] = useState(false);
  // While the shop is private the top bar offers "Open to shoppers · N steps" (design handoff "Colophon platform").
  const wallUp = !!settings?.design?.showUnderConstruction;
  const [openBlockersList, setOpenBlockersList] = useState<ReadinessItem[] | null>(null);
  const openSteps = openBlockersList ? openBlockersList.length : null;
  const [launchOpen, setLaunchOpen] = useState(false);
  useEffect(() => {
    if (!user || !wallUp) return;
    let live = true;
    void blockersBeforeOpening().then((b) => { if (live) setOpenBlockersList(b); });
    return () => { live = false; };
  }, [user, wallUp, activeTab]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  // Settings sections register their unsaved edits (settingsDirty.ts); the tab can't close on them silently.
  useBeforeUnloadWhenDirty();
  /** True when the owner confirmed and the change was saved; false when cancelled or the save failed. */
  async function toggleUnderConstruction(on: boolean, { checked = false }: { checked?: boolean } = {}): Promise<boolean> {
    // Opening runs the same last check as the setup guide, unless the caller just ran it (the guide, the final check).
    if (!on && !checked) {
      setUcSaving(true);
      const blockers = await blockersBeforeOpening();
      setUcSaving(false);
      if (blockers && blockers.length) {
        const look = await confirm({ title: "Your shop isn't ready to sell yet", message: blockedMessage(blockers), confirmLabel: "Show me what's missing" });
        if (look) void goTo("overview");
        return false;
      }
    }
    const ok = await confirm(on
      ? { title: "Close the shop for now?", message: w("Shoppers will see the “under construction” wall instead of your books until you turn it off. You can keep working in the admin."), confirmLabel: "Show the wall" }
      : { title: "Open your shop to shoppers?", message: "The “under construction” page comes down, and anyone with your shop's address can browse and buy straight away. You can close it again any time in Settings › General › Store status.", confirmLabel: "Open my shop" });
    if (!ok) return false;
    setUcSaving(true);
    try {
      await adminApi.setUnderConstruction(on);
      const patch = (d: any) => ({ ...(d || {}), showUnderConstruction: on });
      setSettings((p: any) => p && ({ ...p, design: patch(p.design), draftDesign: patch(p.draftDesign) }));
      setOriginalSettings((p: any) => p && ({ ...p, design: patch(p.design), draftDesign: patch(p.draftDesign) }));
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Couldn't change the under construction wall — nothing was changed. Please try again.");
      return false;
    } finally {
      setUcSaving(false);
    }
  }

  async function loadSettings() {
    try {
      const data = await adminApi.getSettings();
      setSettings(JSON.parse(JSON.stringify(data)));
      setOriginalSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  }

  // Returns true only when the save reached Firestore, so callers never announce a
  // save that failed.
  const saveSection = async (section: string, data: any, options: any = {}): Promise<boolean> => {
    try {
      await adminApi.updateSettings(data, options);
      // Secret keys went to the admin-only store: drop them from what's on screen and
      // mark them stored, so readiness doesn't think they're sitting in public settings.
      data = scrubSavedSecrets(data);
      if (data.design) {
        if (options.publish) {
          setSettings((prev: any) => ({ ...prev, design: data.design, draftDesign: data.design }));
        } else {
          setSettings((prev: any) => ({ ...prev, draftDesign: data.design }));
        }
      } else {
        setSettings((prev: any) => ({ ...prev, ...data }));
        // Keep the "saved" baseline in step so unsaved-change state clears after a save.
        setOriginalSettings((prev: any) => ({ ...prev, ...JSON.parse(JSON.stringify(data)) }));
      }
      return true;
    } catch (err: any) {
      console.error("Saving settings failed:", err);
      toast.error(`Couldn't save — nothing was changed. ${err?.message || ""}`.trim());
      return false;
    }
  };

  // The old whole-collection stats read was never shown; kept as a no-op for the book editor's onSave.

  // Name the browser tab after the page, so several admin tabs (and Back's history list) are told apart.
  const isSettingsPage = activeTab === "settings" || activeTab === "shipping" || activeTab === "payments";
  const settingsChild = activeTab === "shipping" || activeTab === "payments" ? activeTab : settingsPageOf(settingsTab);
  const pageTitle = isSettingsPage
    ? NAV.find((n) => n.id === "settings")?.children?.find((c) => c.id === settingsChild)?.label || "Settings"
    : activeTab === STOCKROOM_TAB ? stockroomPage(subTab)?.label ?? "Stockroom"
    : activeTab === SALES_TAB ? "All sales"
    : activeTab === REORDER_TAB ? "Reorder"
    : w((PAGE_COPY[activeTab] || PAGE_COPY.overview).title);
  useEffect(() => {
    const previous = document.title;
    document.title = adminDocumentTitle(pageTitle);
    return () => { document.title = previous; };
  }, [pageTitle]);

  // Declared before the loading/sign-in returns below: a hook after them crashes the admin on sign-in.
  // A new book's starting values and what to do once it's saved ("Add to the shop" from an inventory app book).
  const [newBookStart, setNewBookStart] = useState<{ prefill: Record<string, any>; onCreated: (id: string) => void } | null>(null);

  if (loading) {
    return (
      <div className="rp" data-rp-appearance={adminTheme === "dark" ? "dark" : "light"}>
        <div className="rp-login" role="status" aria-live="polite">
          <div style={{ display: "grid", justifyItems: "center", gap: 16 }}>
            <div className="rp-brand-mark"><BookOpen size={20} aria-hidden /></div>
            <p className="rp-wordmark-sub">Opening your admin…</p>
          </div>
        </div>
      </div>
    );
  }

  if (bookkeeper) {
    return <Suspense fallback={<div className="rp" data-rp-appearance={adminTheme === "dark" ? "dark" : "light"}><PageSkeleton label="Opening your desk…" /></div>}><BookkeeperDesk email={bookkeeper.email} appearance={adminTheme === "dark" ? "dark" : "light"} /></Suspense>;
  }

  if (fairHelper) {
    return <Suspense fallback={null}><FairHelperDesk email={fairHelper.email} appearance={adminTheme === "dark" ? "dark" : "light"} /></Suspense>;
  }

  // A paused or closed plan: Plan & billing and the downloads only, until the plan is open again (plan 6.7).
  if (user && planLocked(platformPlan ?? null)) {
    return <Suspense fallback={<div className="rp" data-rp-appearance={adminTheme === "dark" ? "dark" : "light"}><PageSkeleton label="Opening Plan & billing…" /></div>}><PlanDesk plan={platformPlan!} email={user.email ?? null} appearance={adminTheme === "dark" ? "dark" : "light"} /></Suspense>;
  }

  if (!user) {
    // A first sign-in learns its role only after the server updates the pass (adminApi.login), so look again then.
    return <Login onLogin={() => {
      void Promise.resolve(adminApi.bookkeeperSignIn?.()).catch(() => null).then((books) => {
        if (books) { setBookkeeper(books); setUser(null); }
      });
      void Promise.resolve(adminApi.fairHelperSignIn?.()).catch(() => null).then((helper) => {
        if (helper) { setFairHelper(helper); setUser(null); }
      });
    }} />;
  }

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await adminApi.logout();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleEditBook = (book: any) => {
    setEditingBook(book);
    setShowEditor(true);
  };
  openBookById.current = (id: string) => {
    adminApi.getBook(id)
      .then((book: any) => { if (book) handleEditBook(book); else setBookLinkProblem(w("That book isn't on the website any more. It may have been deleted.")); })
      .catch(() => setBookLinkProblem(w("That book couldn't be opened just now. Try the link again in a minute, or find it on this Books page.")));
  };

  const handleAddBook = () => {
    setNewBookStart(null);
    setEditingBook(null);
    setShowEditor(true);
  };
  const handleAddBookFrom = (prefill: Record<string, any>, onCreated: (id: string) => void) => {
    setNewBookStart({ prefill, onCreated });
    setEditingBook(null);
    setShowEditor(true);
  };

  const appearance = adminTheme === "dark" ? "dark" : "light";
  const legacyProps = {
    className: `${adminTheme === "light" ? "admin-light" : ""} admin-reso`,
    "data-admin-theme": adminTheme === "light" ? "reso" : "dark",
  } as const;

  // Leaving a Settings page with unsaved edits asks first; leaving drops those edits.
  const leaveSettings = async (): Promise<boolean> => {
    if (!isSettingsPage || !anyDirty()) return true;
    const ok = await confirm({ title: "Leave without saving?", message: "This settings page has changes that haven't been saved. Leaving discards them.", confirmLabel: "Leave without saving" });
    if (ok && originalSettings) setSettings(JSON.parse(JSON.stringify(originalSettings)));
    return ok;
  };
  /** Resolves true when the page changed, false when the owner chose to stay on unsaved settings. */
  // Every alert, and the ones not hidden in this browser: the top bar's pill counts these and #alerts lists them.
  const headsUp = billHeadsUpAlert(platformPlan);
  const allAlerts = [...settingsAlerts(originalSettings), ...alerts, ...(headsUp ? [headsUp] : []), ...Object.values(reminderAlerts)];
  const shownAlerts = visibleAlerts(allAlerts, alertHides.dismissed);
  const goTo = async (id: string): Promise<boolean> => {
    // Nothing unsaved: switch at once (callers such as What's new set a Settings tab right after).
    if (isSettingsPage && anyDirty() && !(await leaveSettings())) return false;
    setActiveTab(id);
    setShowEditor(false);
    setSelectedOrder(null);
    if (id === "settings") setSettingsTab("general");
    setSidebarOpen(false);
    return true;
  };
  // A menu page: a module id, or `settings/<page>` (riso/nav.ts).
  const openMenuPage = (id: string) => {
    if (id.startsWith(SETTINGS_ITEM_PREFIX)) void openSettingsPage(id.slice(SETTINGS_ITEM_PREFIX.length));
    else if (id.startsWith(STOCKROOM_ITEM_PREFIX)) void openStockroomPage(id.slice(STOCKROOM_ITEM_PREFIX.length));
    else void goTo(id);
  };
  // A stockroom page in the combined admin: the stockroom tab with that page as its sub tab (`#stockroom/<page>`).
  // The tab and its page are set together, so the address gets one Back step and the frame opens on that page.
  const openStockroomPage = async (page: string, bookId?: string) => {
    if (isSettingsPage && anyDirty() && !(await leaveSettings())) return;
    setStockroomFocus(bookId ? { page: stockroomPage(page)?.id ?? DEFAULT_STOCKROOM_PAGE, bookId } : null);
    setSubTabState({ page: STOCKROOM_TAB, id: stockroomPage(page)?.id ?? DEFAULT_STOCKROOM_PAGE });
    setActiveTab(STOCKROOM_TAB);
    setShowEditor(false);
    setSelectedOrder(null);
    setSidebarOpen(false);
  };
  openStockroomRef.current = (page, bookId) => { void openStockroomPage(page, bookId); };
  // The tour's stops open menu pages; a stop in fair mode's absence: fair mode ends first, so the rail shows both sides.
  // The walkthrough's stops: one per menu item this admin shows on either side (walkthrough/tourSteps.ts).
  const tourMenuItems = new Set((COMBINED ? [...sideMenu("website"), ...sideMenu("stockroom")] : ADMIN_MENU)
    .map((g) => g.pages.find((p) => !hiddenPages.has(p))).filter((p): p is string => !!p));
  const tourSteps = tourFor({ combined: COMBINED, books: hasPublisherTools(sellsAnswer), menuItems: tourMenuItems });
  const startTour = (start: number | null) => {
    if (fairMode) { rememberFair(false); setFairMode(false); }
    setTourPhase(start === null ? { kind: "welcome" } : { kind: "step", index: start });
  };
  const onStockroomPage = activeTab === STOCKROOM_TAB;
  const stockroomPageId = stockroomPage(onStockroomPage ? subTab : undefined)?.id ?? DEFAULT_STOCKROOM_PAGE;
  const NativeStockroomPage = onStockroomPage ? NATIVE_PAGES[stockroomPageId] : undefined;


  // Shipping/Payments can also be entered as top-level tabs by ShopSettings.
  const navActive = activeTab === "shipping" || activeTab === "payments" ? "settings"
    : activeTab === STOCKROOM_TAB ? STOCKROOM_ITEM_PREFIX + stockroomPageId : activeTab;
  // An old page id (e.g. Email sender's "communications" from older What's new shortcuts) highlights the page it opens.
  const navChild = activeTab === "shipping" || activeTab === "payments" ? activeTab : settingsPageOf(settingsTab);
  // A Settings page picked straight from the sidebar: leaves the book editor / an open order too.
  const openSettingsPage = async (child: string) => {
    if (!(isSettingsPage && child === navChild) && !(await leaveSettings())) return;
    setActiveTab("settings");
    setSettingsTab(child);
    setShowEditor(false);
    setSelectedOrder(null);
    setSidebarOpen(false);
  };

  const stockroomCopy = onStockroomPage ? stockroomPage(stockroomPageId) : undefined;
  const ownCopy = stockroomCopy || (COMBINED ? COMBINED_PAGES.find((p) => p.id === activeTab) : undefined);
  const pageCopy = ownCopy ? { title: ownCopy.label, description: ownCopy.description } : PAGE_COPY[activeTab] || PAGE_COPY.overview;
  const copy = { ...pageCopy, title: w(pageCopy.title), description: w(pageCopy.description) };
  const childLabel = NAV.find((n) => n.id === "settings")?.children?.find((c) => c.id === navChild)?.label;
  const trail: Array<{ label: string; onClick?: () => void }> = [{ label: "Admin", onClick: () => goTo("overview") }];
  if (selectedOrder && activeTab !== "orders") {
    trail.push({ label: "Orders", onClick: () => setSelectedOrder(null) }, { label: "Order detail" });
  } else {
    trail.push({ label: copy.title });
  }
  // General › Store status writes maintenance.enabled; maintenanceMode is an older key kept as a fallback.
  const maintenanceOn = !!(originalSettings?.maintenance?.enabled || settings?.maintenanceMode);
  const initial = (user.displayName?.[0] || user.email?.[0] || "A").toUpperCase();

  const avatar = (
    <span className="rp-avatar" aria-hidden="true">
      {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  );

  // The administrator's own actions: the avatar menu in the top bar, and the account row at the foot of the phone drawer.
  const accountActions = [
    ...(storesPage(platformPlan) ? [{ key: "stores", label: "Switch store", icon: <Store size={16} aria-hidden />, run: () => { window.location.href = storesPage(platformPlan)!; } }] : []),
    { key: "logs", label: "Activity logs", icon: <History size={16} aria-hidden />, run: () => setShowLogs(true) },
    { key: "site", label: "View site", icon: <Globe size={16} aria-hidden />, run: openSite },
    { key: "tour", label: "Take the tour", icon: <Compass size={16} aria-hidden />, run: () => startTour(0) },
    { key: "help", label: "Help", icon: <HelpCircle size={16} aria-hidden />, run: () => { void goTo("help"); } },
    { key: "theme", label: adminTheme === "light" ? "Dark appearance" : "Light appearance", icon: adminTheme === "light" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />, run: toggleTheme },
    { key: "logout", label: loggingOut ? "Logging out…" : "Log out", icon: <LogOut size={16} aria-hidden />, run: handleLogout, tone: "danger" as const, busy: loggingOut },
  ];
  const accountMenuItems = (close: () => void) => accountActions.map((a) => (
    <button key={a.key} role="menuitem" data-tone={a.tone} className="rp-menu-item" disabled={a.busy} aria-busy={a.busy || undefined}
      onClick={() => { if (a.key !== "logout") close(); a.run(); }}>
      {a.icon} {a.label}
    </button>
  ));
  const userName = user.displayName || user.email;

  const destinations = [
    ...nav.filter((n) => !n.children).map((n) => ({ id: n.id, label: n.label, run: () => goTo(n.id) })),
    ...(COMBINED ? COMBINED_PAGES.map((p) => ({ id: p.id, label: p.label, run: () => { void goTo(p.id); } })) : []),
    ...(COMBINED ? STOCKROOM_PAGES.map((p) => ({ id: `stockroom-${p.id}`, label: p.label, run: () => { void openStockroomPage(p.id); } })) : []),
    ...(NAV.find((n) => n.children)?.children || []).filter((c) => !hiddenPages.has(SETTINGS_ITEM_PREFIX + c.id)).map((c) => ({
      id: `settings-${c.id}`, label: `Settings · ${c.label}`,
      run: () => { setActiveTab("settings"); setSettingsTab(c.id); setShowEditor(false); setSelectedOrder(null); },
    })),
  ];

  // Pages fully built from Riso components render outside the legacy compatibility layer.
  const migrated = activeTab === STOCKROOM_TAB || isCombinedTab(activeTab) || activeTab === "reviews" || activeTab === "messages" || activeTab === "orders" || activeTab === "customers" || activeTab === "inventory" || activeTab === "overview" || activeTab === "help" || activeTab === "analytics" || activeTab === "catalog" || activeTab === "discounts" || activeTab === "giftCards" || activeTab === "channels" || activeTab === "socialPosts" || activeTab === "design" || activeTab === "payments" || activeTab === "shipping" || (activeTab === "settings" && (settingsTab === "general" || settingsTab === "notifications" || settingsTab === "payments" || settingsTab === "shipping" || settingsTab === "taxes" || settingsTab === "communications" || settingsTab === "plan" || settingsTab === "billing" || settingsTab === "security" || settingsTab === "google" || settingsTab === "apps"));
  const content = (() => {
    switch (activeTab) {
      case "overview":
        return <HomePage setActiveTab={(tab: string) => { if (tab === "general" || tab === "notifications" || tab === "taxes" || tab === "designer" || tab === "security") { setSettingsTab(tab); setActiveTab("settings"); } else setActiveTab(tab); }} ownerName={user.displayName || ""} onSetWall={(on: boolean) => toggleUnderConstruction(on, { checked: true })} />;
      case "analytics":
        return <AnalyticsPage subTab={subTab} onSubTabChange={openSubTab} setActiveTab={(tab: string) => { if (tab === "google" || tab === "general") { setSettingsTab(tab); setActiveTab("settings"); } else setActiveTab(tab); }} />;
      case "catalog": return <BookCatalog onEdit={handleEditBook} onAdd={handleAddBook} refreshTrigger={catalogRefreshKey} />;
      case "customers": return <Customers initialQuery={searchCustomerQuery} />;
      case "inventory": return <Inventory onEditBook={handleEditBook} onAddBook={handleAddBookFrom} subTab={subTab} onSubTabChange={openSubTab} />;
      case "discounts": return <Discounts />;
      case "help": return <HelpPage combined={COMBINED} sells={sellsAnswer} askUrl={askPersonPage(platformPlan)}
        fromPage={helpFrom.current?.page} fromLabel={helpFrom.current?.label}
        onTour={(start) => startTour(start)} onOpen={(page) => openMenuPage(page)} />;
      case "alerts": return <AlertsPage alerts={shownAlerts} hiddenCount={allAlerts.length - shownAlerts.length}
        onDismiss={alertHides.dismiss} onShowHidden={alertHides.showAll}
        onOpenNotifications={() => { setActiveTab("settings"); setSettingsTab("notifications"); setShowEditor(false); setSelectedOrder(null); }}
        onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }}
        onOpenOrders={() => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder(null); }}
        onOpenWebhook={() => { setActiveTab("settings"); setSettingsTab("payments"); setShowEditor(false); setSelectedOrder(null); }}
        onOpenGeneral={() => { setActiveTab("settings"); setSettingsTab("general"); setShowEditor(false); setSelectedOrder(null); }}
        onOpenBackups={COMBINED ? () => void openStockroomPage("backups") : undefined}
        onOpenInvoices={() => void openStockroomPage("invoices")}
        onOpenBills={() => void openStockroomPage("bills")}
        onOpenInventory={() => { setActiveTab("inventory"); setShowEditor(false); setSelectedOrder(null); }}
        onOpenRoute={(r: AlertRoute) => {
          setActiveTab(r.tab);
          if (r.settingsTab) setSettingsTab(r.settingsTab);
          openSubTab(r.subTab, subTabPage(r));
          setShowEditor(false);
          setSelectedOrder(null);
        }}
        onRetry={() => refreshAlertsRef.current()} />;
      case "giftCards": return <GiftCards openId={openGiftCard} onOpened={() => setOpenGiftCard(null)} />;
      case "channels": return <SalesChannels onOpen={(page) => { if (page === "socialPosts" || page === "channels") goTo(page); else { setActiveTab("settings"); setSettingsTab(page); } }} />;
      case "socialPosts": return <SocialPosts onOpen={(page) => goTo(page)} startWithBook={postBook} onStarted={() => setPostBook(null)} />;
      case "design": return settings ? <DesignHome settings={settings} onViewSite={openSite}
        onOpenStudio={(at) => { setStudioLocation(at ? { ...at, key: Date.now() } : null); setActiveTab("settings"); setSettingsTab("designer"); }} /> : <LoadingState label="Loading…" />;
      case "reviews": return <ReviewsModeration />;
      case "messages": return <Messages onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }} onOpenCustomers={() => goTo("customers")} />;
      // Every stockroom page is drawn by the admin itself (stockroom/nativePages.ts).
      case STOCKROOM_TAB:
        return NativeStockroomPage ? (
          <NativeStockroomPage
            onOpen={(page, opts) => { setStockroomFocus(opts?.bookId ? { page, bookId: opts.bookId } : null); openSubTab(page, STOCKROOM_TAB); }}
            isPage={(id) => !!stockroomPage(id)}
            bookId={stockroomFocus?.page === stockroomPageId ? stockroomFocus.bookId : undefined} />
        ) : null;
      case REORDER_TAB: return COMBINED ? <ReorderList /> : null;
      case SALES_TAB: return COMBINED ? <AllSales onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }} /> : null;
      case "orders":
        // Inbox-style desk: list + the full order page (all Stripe sync/refund/label actions) side by side.
        return <OrdersDesk selectedId={selectedOrder?.id || null} onSelect={(id) => setSelectedOrder(id ? { id } : null)} />;
      default:
        return (
          <ShopSettings
            activeTab={activeTab === "settings" ? settingsTab : activeTab}
            setActiveTab={activeTab === "settings" ? setSettingsTab : (tab: string) => {
              if (tab === "shipping" || tab === "payments") {
                setActiveTab(tab);
              } else {
                setActiveTab("settings");
                setSettingsTab(tab);
              }
            }}
            subTab={subTab}
            onSubTabChange={openSubTab}
            settings={settings}
            setSettings={setSettings}
            originalSettings={originalSettings}
            setOriginalSettings={setOriginalSettings}
            settingsLoading={settingsLoading}
            saveSection={saveSection}
            onUnderConstruction={toggleUnderConstruction}
            onOpenOrders={() => goTo("orders")}
          />
        );
    }
  })();

  // The Overview draws its own masthead and shows the alerts under it (PageAlertsSlot); every other page gets them under its PageHeader.
  const ownMasthead = activeTab === "overview" && !selectedOrder;
  const pageAlerts = null;

  // Which side of the combined admin the page is on (Website or Stockroom, Julian 10 Nov 2026); Home is the website's.
  const currentSide = sideOf(navActive === "settings" ? SETTINGS_ITEM_PREFIX + navChild : navActive);
  // The rail's items (top level only) and the pills for the pages of the item you are on (redesign, 11 Nov 2026).
  const setFair = (on: boolean) => {
    rememberFair(on); setFairMode(on);
    void openMenuPage(on ? FAIR_MENU[0].pages[0] : sideMenu("stockroom")[0].pages[0]);
  };
  const railMenu = COMBINED ? (fairMode ? FAIR_MENU : sideMenu(currentSide)) : ADMIN_MENU;
  const railItems = withoutPages(sidebarItems(nav, railMenu), hiddenPages).map((n) => {
    // Orders counts open cancel/return requests too (they sit in Needs attention).
    // Privacy requests are handled in Settings › General.
    const badgeFor = (id: string) => id === "orders" ? ordersBadge : id === "reviews" ? otherBadges.pendingReviews
      : id === "messages" ? otherBadges.unreadMessages : id === SETTINGS_ITEM_PREFIX + "general" ? otherBadges.openPrivacyRequests : undefined;
    // Five menu items (plan 1.27): an item shows the sum of its pages' counts, each page its own.
    const pages = n.children ? n.children.map((c) => ({ ...c, badge: badgeFor(c.id) || 0 })) : undefined;
    const badge = pages ? pages.reduce((sum, c) => sum + c.badge, 0) : badgeFor(n.id);
    return { ...n, label: w(n.label), ...(pages ? { children: pages } : {}), ...(badge === undefined ? {} : { badge: badge || 0 }) };
  });
  const activePageId = navActive === "settings" ? SETTINGS_ITEM_PREFIX + navChild : navActive;
  const activeItemId = menuItemFor(activePageId, COMBINED && fairMode && FAIR_MENU.some((g) => g.pages.includes(activePageId)) ? FAIR_MENU : ADMIN_MENU);
  const activeItem = railItems.find((n) => n.id === activeItemId);
  const sections = activeItem?.children ? itemSections(railMenu, activeItemId, activeItem.children) : null;
  const settingsColumn = !showEditor && !selectedOrder && !!sections && (activeItem?.children?.length ?? 0) > 1;
  const pageTabs = !showEditor && activeItem?.children && activeItem.children.length > 1 ? (
    <PageTabs label={`${activeItem.label} pages`} column={!!sections} current={activePageId} onPick={(page) => { void openMenuPage(page); }}
      groups={sections ?? [{ pages: activeItem.children }]} />
  ) : null;
  return (
    <ShopWordsContext.Provider value={w}>
    <ShopSellsContext.Provider value={sellsAnswer}>
    <ToastProvider>
      <Dialog open={!!bookLinkProblem} onClose={() => setBookLinkProblem(null)} title={w("Couldn't open that book")}
        footer={<SecondaryButton data-autofocus onClick={() => setBookLinkProblem(null)}>Close</SecondaryButton>}>
        <p style={{ margin: 0 }}>{bookLinkProblem}</p>
      </Dialog>
      <AppShell
        appearance={appearance}
        // A stockroom page (the Fair till above all) says it's offline in its own words and keeps selling; the admin's
        // card would cover the till's buttons on a phone and repeat it.
        overlay={<SyncChip state={online || onStockroomPage ? null : "offline"} />}
        sidebar={
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            items={railItems}
            flat
            activeId={showEditor ? null : activeItemId}
            activeChildId={activePageId}
            onSelect={openMenuPage}
            onSelectChild={(_item, page) => openMenuPage(page)}
            top={COMBINED && fairMode ? <FairCard /> : COMBINED ? <SideSwitch side={currentSide} stockroomCount={stockroomTodos.items?.length || 0} onPick={(side) => { setSidebarOpen(false); void openMenuPage(sideMenu(side)[0].pages[0]); }} />
              : hasStockroom() ? <AppSwitcher onSwitch={() => setSidebarOpen(false)} /> : undefined}
            brand={storesPage(platformPlan) ? (
              <StoreSwitcher name={shopNameFromSettings(settings)} tag={platformPlan?.state === "trial" ? "Free trial" : null}
                storesUrl={storesPage(platformPlan)!} addUrl={addStorePage(platformPlan)}
                onOverview={() => { setSidebarOpen(false); void goTo("overview"); }} />
            ) : (
              <a className="rp-brand-link" href="#overview" aria-label={COMBINED ? "Admin: go to Overview" : "Website admin: go to Overview"}
                onClick={(e) => { e.preventDefault(); setSidebarOpen(false); void goTo("overview"); }}>
                <span className="rp-brand-tile" aria-hidden="true">{(shopNameFromSettings(settings) || "S").trim().charAt(0).toUpperCase()}</span>
                <span className="rp-brand-text">
                  <span className="rp-wordmark">{brandWords.first}{brandWords.rest ? <em> {brandWords.rest}</em> : null}</span>
                  <span className="rp-wordmark-sub">{COMBINED ? "Colophon" : "Website admin"}</span>
                </span>
              </a>
            )}
            footer={
              <>
              {COMBINED && (
                <button type="button" className="rp-fair-toggle" aria-pressed={fairMode} onClick={() => { setSidebarOpen(false); setFair(!fairMode); }}>
                  {fairMode ? "End fair mode" : "Start fair mode"}
                </button>
              )}
              <WhatsNew appearance={appearance} onHistoryOpen={() => setSidebarOpen(false)} onNavigate={async (link) => { if (link.studio) { window.location.hash = link.studio; return; } if (!(await goTo(link.tab))) return; if (link.settingsTab) setSettingsTab(link.settingsTab); }} />
              <button type="button" className="rp-rail-help" data-tour="help" aria-current={activeTab === "help" ? "page" : undefined}
                onClick={() => { setSidebarOpen(false); void goTo("help"); }}>
                <HelpCircle size={14} aria-hidden /> Help
              </button>
              <button type="button" className="rp-night-look" aria-pressed={adminTheme === "dark"} onClick={toggleTheme}>
                {adminTheme === "dark" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />} {adminTheme === "dark" ? "Day look" : "Night look"}
              </button>
              <DrawerAccount avatar={avatar} name={userName} role={isShopOwner(user.email) ? "Owner" : "Team"} email={user.email} onViewSite={openSite}
                menuItems={(close) => accountMenuItems(() => { close(); setSidebarOpen(false); })} />
              </>
            }
          />
        }
        topbar={
          <Topbar>
            <IconButton label="Open navigation" className="rp-menu-only" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
              <Menu size={20} aria-hidden />
            </IconButton>
            {/* Phones: the wordmark sits in the top bar (the rail is a drawer there). */}
            {COMBINED && fairMode && <span className="rp-fair-pill">Fair mode · offline-ready</span>}
            <a className="rp-topbar-wordmark" href="#overview" onClick={(e) => { e.preventDefault(); void goTo("overview"); }}>{shopNameFromSettings(settings)}</a>
            <GlobalSearch destinations={destinations} onOpenBook={handleEditBook} shortcut={!showEditor && !(activeTab === "settings" && settingsTab === "designer")}
              appBooks={appSearch.books} appConnected={appSearch.connected} request={searchRequest}
              onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }}
              onOpenCustomer={(q) => { setSearchCustomerQuery(q); goTo("customers"); }} />
            <div className="rp-topbar-actions">
              {hasStockroom() && !COMBINED && <AppSwitchPill />}
              {wallUp && (
                <span className="rp-open-shop">
                  <PrimaryButton size="sm" busy={ucSaving} onClick={() => { if (openSteps) setLaunchOpen(true); else void toggleUnderConstruction(false); }}>
                    <span className="rp-open-shop-long">{openButtonLabel(openSteps)}</span><span className="rp-open-shop-short" aria-hidden>Open</span>
                  </PrimaryButton>
                </span>
              )}
              {trialPill(platformPlan ?? null) && <a className="rp-trial-pill" href="#settings/billing">{trialPill(platformPlan ?? null)}</a>}
              <AlertsPill alerts={shownAlerts} onOpen={() => { void goTo("alerts"); }} />
              <ShopStatusMenu
                wallOn={!!settings?.design?.showUnderConstruction}
                checkoutPaused={maintenanceOn}
                busy={ucSaving}
                disabled={!settings}
                onSetWall={(on) => { void toggleUnderConstruction(on); }}
                onOpenSettings={() => { void openSettingsPage("general").then(() => openSubTab("gs-store", "general")); }}
              />
              <div className="rp-menu-wrap rp-avatar-menu" ref={userMenuRef}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setUserMenuOpen(false); }}
                onKeyDown={(e) => {
                  if (!userMenuOpen) return;
                  const items = Array.from(userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
                  const i = items.indexOf(document.activeElement as HTMLElement);
                  if (e.key === "Escape") { setUserMenuOpen(false); userMenuBtn.current?.focus(); }
                  else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
                }}>
                <button ref={userMenuBtn} type="button" className="rp-icon-btn rp-avatar-btn"
                  aria-label="Administrator menu" aria-haspopup="menu" aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}>
                  {avatar}<ChevronDown size={14} aria-hidden />
                </button>
                {userMenuOpen && (
                  <div className="rp-menu" role="menu">
                    <div className="rp-menu-label">{user.email}</div>
                    {accountMenuItems(() => setUserMenuOpen(false))}
                  </div>
                )}
              </div>
            </div>
          </Topbar>
        }
      >
        <SupportBanner visit={supportVisit} onSignOut={() => { void adminApi.logout(); }} />
        {!(activeTab === "settings" && (settingsTab === "billing" || settingsTab === "plan")) && !(activeTab === "overview" && closingDay(platformPlan)) && <PlanBannerBar plan={platformPlan} />}
        {/* The control room's messages to the press (platform/messages, code plan 19.14): admin only, never the storefront. */}
        <PlatformMessagesBar enabled={!!user} />
        {!!user && !supportVisit && <LocalBackupAuto />}
        {!!user && !supportVisit && COMBINED && <Suspense fallback={null}><AutoReminders onAlert={addReminderAlert} /></Suspense>}
        {/* The stockroom's daily online copy (Stockroom › Backups), made by the owner's admin. */}
        {!!user && !supportVisit && COMBINED && isShopOwner(user.email) && <Suspense fallback={null}><StockroomCopyAuto /><FairHelperInbox /><WebsiteOrdersAuto /></Suspense>}
        {/* The admin home asks a paid plan's owner to turn on two-step sign-in (TwoStepReminder.tsx, plan 22.10). */}
        {activeTab === "overview" && !supportVisit && <TwoStepReminder plan={platformPlan} />}
        {/* The Overview board draws its own header (title, period, layout and Edit board). */}
        {!ownMasthead && <PageHeader
          breadcrumbs={headOverride ? (headOverride.back ? <BackLink label={headOverride.back.label} onClick={headOverride.back.onClick} /> : undefined) : trail.length > 2 ? <Breadcrumbs trail={trail} /> : undefined}
          title={headOverride ? headOverride.title : selectedOrder && activeTab !== "orders" ? "Order detail" : navActive === "settings" && childLabel ? childLabel : copy.title}
          description={headOverride ? headOverride.description : selectedOrder ? undefined : navActive === "settings" && childLabel ? (navChild && PAGE_COPY[navChild]?.description) || undefined : copy.description || undefined}
          actions={<div ref={setPageActionsEl} className="rp-page-actions-slot" />}
        />}
        {/* Settings lists its pages in a column on the left, under headings (redesign); other items show pills above. */}
        <div className="rp-page-body" data-layout={settingsColumn ? "column" : undefined} data-sub={headOverride ? "" : undefined}>
          {!selectedOrder && pageTabs}
          <div className="rp-page-main">
          {!ownMasthead && pageAlerts}
          {/* Feature pages still use legacy utility classes; scope the compatibility layer to them only. */}
          <div {...(migrated ? {} : legacyProps)} style={{ background: "transparent", minHeight: 480 }}>
            <AnimatePresence mode="wait">
              <m.div
                key={activeTab + (selectedOrder ? "-detail" : "") + settingsTab + (showEditor ? "-editor" : "")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <PageAlertsSlot.Provider value={ownMasthead ? pageAlerts : null}><PageActionsSlot.Provider value={ownMasthead ? null : pageActionsEl}><PageHeadSlot.Provider value={ownMasthead ? null : setHeadOverride}><AdminPageBoundary resetKey={activeTab + "|" + settingsTab + "|" + (subTab || "") + "|" + (selectedOrder?.id || "") + (showEditor ? "|editor|" + String(editingBook?.id || "new") : "")}><Suspense fallback={<PageSkeleton label="Opening page…" />}>{showEditor ? (
              <BookEditor
                book={editingBook}
                prefill={editingBook ? null : newBookStart?.prefill}
                onCreated={editingBook ? undefined : newBookStart?.onCreated}
                onClose={() => setShowEditor(false)}
                onSave={(opts) => {
                  if (!opts?.stayOpen) setShowEditor(false);
                  if (activeTab === "catalog") {
                    setCatalogRefreshKey(prev => prev + 1);
                  }
                }}
              />
              ) : content}</Suspense></AdminPageBoundary></PageHeadSlot.Provider></PageActionsSlot.Provider></PageAlertsSlot.Provider>
              </m.div>
            </AnimatePresence>
          </div>
          </div>
        </div>
        {!showEditor && <PhoneNav items={railItems} activeId={activeItemId} onPick={(id) => { const it = railItems.find((n) => n.id === id); void openMenuPage(it?.children?.[0]?.id ?? id); }}
          fairMode={fairMode} onFair={COMBINED ? () => setFair(!fairMode) : undefined} onHelp={() => { void goTo("help"); }}
          night={adminTheme === "dark"} onNight={toggleTheme} />}
      </AppShell>

      <AdminTour phase={tourPhase} setPhase={setTourPhase} steps={tourSteps} combined={COMBINED} shopName={shopNameFromSettings(settings)}
        appearance={appearance} onGo={(page) => openMenuPage(page)} onClose={endTour} onOpenHelp={() => { void goTo("help"); }} />

      {confirmNode}
      <LaunchChecklist appearance={appearance} open={launchOpen} blockers={openBlockersList || []} busy={ucSaving} onClose={() => setLaunchOpen(false)}
        onGo={(tab) => { setLaunchOpen(false); void goTo(tab); }}
        onOpenShop={() => { void toggleUnderConstruction(false).then((ok) => { if (ok) setLaunchOpen(false); }); }} />
      <ActivityLogDialog open={showLogs} onClose={() => setShowLogs(false)} appearance={appearance} />

      {/* Theme Editor Takeover */}
      <AnimatePresence>
        {activeTab === "settings" && settingsTab === "designer" && settings && (
          <div {...legacyProps} style={{ background: "transparent" }}>
            <m.div
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: "circOut" }}
              className="fixed inset-0 z-[200] bg-black"
            >
              <AdminPageBoundary resetKey={String(studioLocation?.key || "")}><Suspense fallback={<div className="rp" data-rp-appearance={appearance} style={{ height: "100%", display: "grid", placeItems: "center" }}><LoadingState label="Opening Design studio…" /></div>}>
              <StudioEditor
                key={studioLocation?.key}
                initialLocation={studioLocation || undefined}
                appearance={appearance}
                settings={settings}
                onExit={() => { setActiveTab("design"); setSettingsTab("general"); }}
                onPersisted={(design: any, published: boolean) =>
                  setSettings((prev: any) => ({ ...prev, draftDesign: design, ...(published ? { design } : {}) }))
                }
              />
              </Suspense></AdminPageBoundary>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </ToastProvider>
    </ShopSellsContext.Provider>
    </ShopWordsContext.Provider>
  );
}
