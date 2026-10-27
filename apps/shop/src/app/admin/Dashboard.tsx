import "../../styles/adminCompat.css";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { markOwnerDeviceOnSignIn, SHOP_OWNER_EMAIL } from "../lib/ownerDevice";
// `m` + the app-wide LazyMotion (domAnimation): the full `motion` component would pull layout/drag code into the shop's first load.
import { m, AnimatePresence } from "motion/react";
import {
  BookOpen, LogOut, History, Globe, Menu, HelpCircle, Sun, Moon, ChevronDown,
} from "lucide-react";

import { Login } from "./Login";
import { BookCatalog } from "./BookCatalog";
import { ordersNeedingWork, refreshOrdersCache } from "./Orders";
import { AdminAlerts } from "./AdminAlerts.tsx";
import { shopErrorAlert, shopErrorRows } from "./shopErrors";
import { backupAlert, buildAdminAlerts, checkFailedAlert, inventoryLinkAlerts, settingsAlerts, type AdminAlert, type AlertRoute } from "./adminAlerts";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { inventoryLinkView, setInventoryLink, type AppBookEntry } from "./appSwitch";
import { AppSwitcher, AppSwitchPill, useWebsiteTabName } from "./AppSwitcher";
import { getOrdersCached, peekOrders, setOrdersLoader } from "./ordersCache";
import { anyDirty, useBeforeUnloadWhenDirty } from "./settingsDirty";
import { adminApi } from "./api";
import { scrubSavedSecrets } from "./privateKeys";
import toast from "react-hot-toast";
import {
  AppShell, Sidebar, Topbar, PageHeader, Breadcrumbs, PrimaryButton, SecondaryButton,
  IconButton, Dialog, ToastProvider, SyncChip, useOnline, LoadingState, PageSkeleton, useConfirm, PageAlertsSlot,
} from "./riso/components";
import { GlobalSearch, ActivityLogDialog, ShopStatusMenu, DrawerAccount } from "./riso/shellParts";
import { WhatsNew } from "./WhatsNew";
import { parseStudioLocation, type StudioLocation } from "../lib/studioLocation";
import { useAdminAppManifest } from "./adminApp";
import { NAV, PAGE_COPY, SETTINGS_ITEM_PREFIX, sidebarItems } from "./riso/nav";
import { OVERVIEW_HASH_EVENT, adminDocumentTitle, hashForRoute, keepsSubTab, routeFromHash, sameSection, searchFromHash, settingsPageOf, subTabPage } from "./adminRoute";

// Studio is large and only opened from Settings › Design, so it loads in its own chunk.
const StudioEditor = lazy(() => import("./studio/StudioWorkspace").then(m => ({ default: m.StudioWorkspace })));
// Heavy admin pages load in their own chunks when first opened.
const BookEditor = lazy(() => import("./BookEditor").then(m => ({ default: m.BookEditor })));
const Discounts = lazy(() => import("./Discounts").then(m => ({ default: m.Discounts })));
const GiftCards = lazy(() => import("./GiftCards").then(m => ({ default: m.GiftCards })));
const Customers = lazy(() => import("./Customers").then(m => ({ default: m.Customers })));
const Inventory = lazy(() => import("./Inventory").then(m => ({ default: m.Inventory })));
const OrdersDesk = lazy(() => import("./OrdersDesk.tsx").then(m => ({ default: m.OrdersDesk })));
const AnalyticsDashboard = lazy(() => import("./overview/AnalyticsDashboard").then(m => ({ default: m.AnalyticsDashboard })));
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
  return { ...(routeFromHash(hash) || { tab: "overview" }), studio: null as StudioLocation | null };
}

export function Dashboard() {
  const online = useOnline();
  useAdminAppManifest();
  useWebsiteTabName();
  const [boot] = useState(readBootRoute);
  const [activeTab, setActiveTab] = useState(boot.tab);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingBook, setEditingBook] = useState<any | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [studioLocation, setStudioLocation] = useState<(StudioLocation & { key: number }) | null>(boot.studio ? { ...boot.studio, key: 1 } : null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(boot.orderId ? { id: boot.orderId } : null);
  const [openGiftCard, setOpenGiftCard] = useState<string | null>(boot.giftCardId || null);
  const [settingsTab, setSettingsTab] = useState(boot.settingsTab || "general");
  // The open sub tab of a page split into sub tabs (General, Payments, Email sender, Shipping, Inventory), with the
  // page it belongs to: any other page shows its first tab, so leaving a page and coming back starts on its first tab.
  const [subTabState, setSubTabState] = useState<{ page: string; id?: string }>({ page: subTabPage(boot), id: boot.subTab });
  const subPage = subTabPage({ tab: activeTab, settingsTab });
  const subTab = subTabState.page === subPage ? subTabState.id : undefined;
  /** Opens a sub tab (`undefined` = the first) on the page on screen, or on `page` when a link opens another page too. */
  const openSubTab = (id: string | undefined, page: string = subPage) => setSubTabState({ page, id });
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
      if (!route) return;
      setShowEditor(false);
      setActiveTab(route.tab);
      if (route.settingsTab) setSettingsTab(route.settingsTab);
      setSubTabState({ page: subTabPage(route), id: route.subTab });
      setSelectedOrder(route.orderId ? { id: route.orderId } : null);
      setOpenGiftCard(route.giftCardId || null);
      if (route.bookId) openBookById.current(route.bookId);
    };
    // The Overview names its sub tab in the address itself; remember it as seen.
    const overviewWrote = () => { lastHash.current = window.location.hash; };
    // The admin opened from one of those links (the boot route already chose the page).
    const bootSearch = searchFromHash(window.location.hash);
    if (bootSearch) setSearchRequest({ q: bootSearch, n: Date.now() });
    if (boot.bookId) openBookById.current(boot.bookId);
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
  // Pending reviews, unread messages and open privacy requests (cheap server counts).
  const [otherBadges, setOtherBadges] = useState<{ pendingReviews: number | null; unreadMessages: number | null; openPrivacyRequests: number | null }>({ pendingReviews: null, unreadMessages: null, openPrivacyRequests: null });
  const [searchCustomerQuery, setSearchCustomerQuery] = useState<string | undefined>(undefined);
  // What the last check read besides the orders (Stripe webhook, email log, backup, inventory link), so opening or
  // closing an order re-counts the badge and alerts from memory without reading any of it again.
  const alertInputs = useRef<{ webhook: any; emailLog: any[]; backup: any; linkState: any; shopErrors: any[]; failedParts: string[] } | null>(null);
  const showAlerts = (data: any[]) => {
    const inputs = alertInputs.current;
    if (!inputs) return;
    setOrdersBadge(ordersNeedingWork(data));
    const backupNote = backupAlert(inputs.backup);
    const note = checkFailedAlert(inputs.failedParts);
    const errorsNote = shopErrorAlert(shopErrorRows(inputs.shopErrors));
    setAlerts([...buildAdminAlerts(data, inputs.webhook, Date.now(), inputs.emailLog), ...inventoryLinkAlerts(inputs.linkState), ...(backupNote ? [backupNote] : []), ...(errorsNote ? [errorsNote] : []), ...(note ? [note] : [])]);
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
          const [webhook, emailLog, backup, linkState, shopErrors] = await Promise.all([
            adminApi.getStripeWebhookStatus({ strict: true }).catch(() => { failedParts.push("the Stripe webhook status"); return null; }),
            adminApi.getRecentEmailLog(50).catch(() => { failedParts.push("the email log"); return []; }),
            adminApi.getBackupStatus().catch(() => { failedParts.push("the backup status"); return undefined; }),
            inventoryLinkApi.state().catch(() => { failedParts.push("the inventory app link"); return null; }),
            adminApi.getClientErrors(20).catch(() => { failedParts.push("the shop errors"); return []; }),
          ]);
          if (!alive) return;
          alertInputs.current = { webhook, emailLog, backup, linkState, shopErrors, failedParts };
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
  const [settings, setSettings] = useState<any>(null);
  const [originalSettings, setOriginalSettings] = useState<any>(null);
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
  const [helpOpen, setHelpOpen] = useState(false);

  const [adminTheme, setAdminTheme] = useState(() => {
    // Reso is the admin's primary design, not an optional storefront skin.
    // A versioned preference moves existing installs off the legacy dark UI
    // once while still letting an administrator deliberately choose dark mode.
    return localStorage.getItem("adminThemeReso") || "light";
  });

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
        email: "lyricalmyricalbooks@gmail.com",
        photoURL: null
      });
      setLoading(false);
      loadSettings();
      return;
    }

    const unsubscribe = adminApi.onAuthStateChange((u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // The owner's own browsers never count as shop traffic (Settings › General › Your own visits).
        if (String(u.email || "").toLowerCase() === SHOP_OWNER_EMAIL) markOwnerDeviceOnSignIn();
        loadSettings();
      }
    });
    return () => unsubscribe();
  }, []);

  const [ucSaving, setUcSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  // Settings sections register their unsaved edits (settingsDirty.ts); the tab can't close on them silently.
  useBeforeUnloadWhenDirty();
  /** True when the owner confirmed and the change was saved; false when cancelled or the save failed. */
  async function toggleUnderConstruction(on: boolean): Promise<boolean> {
    const ok = await confirm(on
      ? { title: "Close the shop for now?", message: "Shoppers will see the “under construction” wall instead of your books until you turn it off. You can keep working in the admin.", confirmLabel: "Show the wall" }
      : { title: "Open the shop?", message: "The “under construction” wall comes down and shoppers can browse and buy again straight away.", confirmLabel: "Open the shop" });
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
    : (PAGE_COPY[activeTab] || PAGE_COPY.overview).title;
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
            <p className="rp-wordmark-sub">Opening publishing house…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={() => {}} />;
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
      .then((book: any) => { if (book) handleEditBook(book); else setBookLinkProblem("That book isn't on the website any more. It may have been deleted."); })
      .catch(() => setBookLinkProblem("That book couldn't be opened just now. Try the link again in a minute, or find it on this Books page."));
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
  const goToChild = async (_parent: string, child: string) => {
    if (child !== navChild && !(await leaveSettings())) return;
    setActiveTab("settings");
    setSettingsTab(child);
    setSidebarOpen(false);
  };

  // Shipping/Payments can also be entered as top-level tabs by ShopSettings.
  const navActive = activeTab === "shipping" || activeTab === "payments" ? "settings" : activeTab === "analytics" ? "overview" : activeTab;
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

  const copy = PAGE_COPY[activeTab] || PAGE_COPY.overview;
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
    { key: "logs", label: "Activity logs", icon: <History size={16} aria-hidden />, run: () => setShowLogs(true) },
    { key: "site", label: "View site", icon: <Globe size={16} aria-hidden />, run: openSite },
    { key: "help", label: "Help & shortcuts", icon: <HelpCircle size={16} aria-hidden />, run: () => setHelpOpen(true) },
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
    ...NAV.filter((n) => !n.children).map((n) => ({ id: n.id, label: n.label, run: () => goTo(n.id) })),
    ...(NAV.find((n) => n.children)?.children || []).map((c) => ({
      id: `settings-${c.id}`, label: `Settings · ${c.label}`,
      run: () => { setActiveTab("settings"); setSettingsTab(c.id); setShowEditor(false); setSelectedOrder(null); },
    })),
  ];

  // Pages fully built from Riso components render outside the legacy compatibility layer.
  const migrated = activeTab === "reviews" || activeTab === "messages" || activeTab === "orders" || activeTab === "customers" || activeTab === "inventory" || activeTab === "overview" || activeTab === "analytics" || activeTab === "catalog" || activeTab === "discounts" || activeTab === "giftCards" || activeTab === "payments" || activeTab === "shipping" || (activeTab === "settings" && (settingsTab === "general" || settingsTab === "notifications" || settingsTab === "payments" || settingsTab === "shipping" || settingsTab === "taxes" || settingsTab === "communications"));
  const content = (() => {
    switch (activeTab) {
      case "overview":
      case "analytics":
        return <AnalyticsDashboard setActiveTab={(tab: string) => { if (tab === "general" || tab === "notifications" || tab === "taxes") { setSettingsTab(tab); setActiveTab("settings"); } else setActiveTab(tab); }} onEditBook={handleEditBook} />;
      case "catalog": return <BookCatalog onEdit={handleEditBook} onAdd={handleAddBook} refreshTrigger={catalogRefreshKey} />;
      case "customers": return <Customers initialQuery={searchCustomerQuery} />;
      case "inventory": return <Inventory onEditBook={handleEditBook} onAddBook={handleAddBookFrom} subTab={subTab} onSubTabChange={openSubTab} />;
      case "discounts": return <Discounts />;
      case "giftCards": return <GiftCards openId={openGiftCard} onOpened={() => setOpenGiftCard(null)} />;
      case "reviews": return <ReviewsModeration />;
      case "messages": return <Messages onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }} onOpenCustomers={() => goTo("customers")} />;
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
  const ownMasthead = (activeTab === "overview" || activeTab === "analytics") && !selectedOrder;
  const pageAlerts = (
    <AdminAlerts
      alerts={[...settingsAlerts(originalSettings), ...alerts]}
      onOpenNotifications={() => { setActiveTab("settings"); setSettingsTab("notifications"); setShowEditor(false); setSelectedOrder(null); }}
      onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }}
      onOpenOrders={() => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder(null); }}
      onOpenWebhook={() => { setActiveTab("settings"); setSettingsTab("payments"); setShowEditor(false); setSelectedOrder(null); }}
      onOpenGeneral={() => { setActiveTab("settings"); setSettingsTab("general"); setShowEditor(false); setSelectedOrder(null); }}
      onOpenInventory={() => { setActiveTab("inventory"); setShowEditor(false); setSelectedOrder(null); }}
      onOpenRoute={(r: AlertRoute) => {
        setActiveTab(r.tab);
        if (r.settingsTab) setSettingsTab(r.settingsTab);
        openSubTab(r.subTab, subTabPage(r));
        setShowEditor(false);
        setSelectedOrder(null);
      }}
      onRetry={() => refreshAlertsRef.current()}
    />
  );

  return (
    <ToastProvider>
      <Dialog open={!!bookLinkProblem} onClose={() => setBookLinkProblem(null)} title="Couldn't open that book"
        footer={<SecondaryButton data-autofocus onClick={() => setBookLinkProblem(null)}>Close</SecondaryButton>}>
        <p style={{ margin: 0 }}>{bookLinkProblem}</p>
      </Dialog>
      <AppShell
        appearance={appearance}
        overlay={<SyncChip state={online ? null : "offline"} />}
        sidebar={
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            items={sidebarItems(NAV).map((n) => {
              // Orders counts open cancel/return requests too (they sit in Needs attention).
              // Privacy requests are handled in Settings › General.
              const badge = n.id === "orders" ? ordersBadge : n.id === "reviews" ? otherBadges.pendingReviews
                : n.id === "messages" ? otherBadges.unreadMessages : n.id === SETTINGS_ITEM_PREFIX + "general" ? otherBadges.openPrivacyRequests : undefined;
              return badge === undefined ? n : { ...n, badge: badge || 0 };
            })}
            activeId={showEditor ? null : navActive === "settings" ? SETTINGS_ITEM_PREFIX + navChild : navActive}
            activeChildId={navChild}
            onSelect={(id) => { if (id.startsWith(SETTINGS_ITEM_PREFIX)) void openSettingsPage(id.slice(SETTINGS_ITEM_PREFIX.length)); else void goTo(id); }}
            onSelectChild={goToChild}
            top={<AppSwitcher onSwitch={() => setSidebarOpen(false)} />}
            brand={
              <a className="rp-brand-link" href="#overview" aria-label="Lyricalmyrical website admin: go to Overview"
                onClick={(e) => { e.preventDefault(); setSidebarOpen(false); void goTo("overview"); }}>
                <span className="rp-brand-text">
                  <span className="rp-wordmark">Lyrical<em>myrical</em></span>
                  <span className="rp-wordmark-sub">Website admin</span>
                </span>
              </a>
            }
            footer={
              <>
              <WhatsNew appearance={appearance} onHistoryOpen={() => setSidebarOpen(false)} onNavigate={async (link) => { if (link.studio) { window.location.hash = link.studio; return; } if (!(await goTo(link.tab))) return; if (link.settingsTab) setSettingsTab(link.settingsTab); }} />
              <DrawerAccount avatar={avatar} name={userName} email={user.email} onViewSite={openSite}
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
            <a className="rp-topbar-wordmark" href="#overview" onClick={(e) => { e.preventDefault(); void goTo("overview"); }}>Lyricalmyrical</a>
            <GlobalSearch destinations={destinations} onOpenBook={handleEditBook} shortcut={!showEditor && !(activeTab === "settings" && settingsTab === "designer")}
              appBooks={appSearch.books} appConnected={appSearch.connected} request={searchRequest}
              onOpenOrder={(id) => { setActiveTab("orders"); setShowEditor(false); setSelectedOrder({ id }); }}
              onOpenCustomer={(q) => { setSearchCustomerQuery(q); goTo("customers"); }} />
            <div className="rp-topbar-actions">
              <AppSwitchPill />
              <ShopStatusMenu
                wallOn={!!settings?.design?.showUnderConstruction}
                checkoutPaused={maintenanceOn}
                busy={ucSaving}
                disabled={!settings}
                onSetWall={(on) => { void toggleUnderConstruction(on); }}
                onOpenSettings={() => { void openSettingsPage("general"); }}
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
        {/* The Overview board draws its own header (title, period, layout and Edit board). */}
        {!ownMasthead && <PageHeader
          breadcrumbs={trail.length > 2 ? <Breadcrumbs trail={trail} /> : undefined}
          title={selectedOrder && activeTab !== "orders" ? "Order detail" : navActive === "settings" && childLabel ? childLabel : copy.title}
        />}
        {!ownMasthead && pageAlerts}
        {/* Feature pages still use legacy utility classes; scope the compatibility layer to them only. */}
        <div {...(migrated ? {} : legacyProps)} style={{ background: "transparent", minHeight: 480 }}>
          <AnimatePresence mode="wait">
            <m.div
              key={activeTab + (selectedOrder ? "-detail" : "") + settingsTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <PageAlertsSlot.Provider value={ownMasthead ? pageAlerts : null}><Suspense fallback={<PageSkeleton label="Opening page…" />}>{content}</Suspense></PageAlertsSlot.Provider>
            </m.div>
          </AnimatePresence>
        </div>
      </AppShell>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Help & shortcuts" appearance={appearance}
        footer={<PrimaryButton onClick={() => setHelpOpen(false)}>Got it</PrimaryButton>}>
        <div className="rp-help">
          <h3 className="rp-help-head">Keyboard shortcuts</h3>
          <dl className="rp-help-keys">
            <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd></dt><dd>Search: jump to any admin page, or open a book (title, author, ISBN, SKU), an order (number with or without #, customer email or name) or a customer.</dd>
            <dt><kbd>J</kbd> / <kbd>K</kbd></dt><dd>Orders: next / previous order.</dd>
            <dt><kbd>/</kbd></dt><dd>Orders: jump to the search box (<kbd>Esc</kbd> clears it).</dd>
            <dt><kbd>Esc</kbd></dt><dd>Close any dialog; you go back to where you were.</dd>
            <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd></dt><dd>Design studio: save the draft (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> opens Find anything there).</dd>
          </dl>
          <h3 className="rp-help-head">How things work</h3>
          <ul className="rp-help-list">
            <li><strong>Payments:</strong> card (Stripe) and PayPal orders are marked paid automatically once the payment is confirmed. Cash and e-Transfer orders wait as pending: open the order › <strong>More order actions</strong> › <strong>Payment received — mark paid</strong> once the money has arrived.</li>
            <li><strong>Shop status</strong> (top bar): shows whether shoppers can buy. Open it to close the shop behind the “under construction” wall, or to open it again.</li>
            <li><strong>Design studio:</strong> changes are saved as a draft first; Publish when you're ready.</li>
            <li><strong>Bookmarks:</strong> the address bar keeps your place, so pages can be bookmarked or shared: <code>#orders/&lt;id&gt;</code>, <code>#customers?q=&lt;email&gt;</code>, <code>#settings/payments</code>, <code>#gift-cards</code>, <code>#designer</code>. Reload and Back/Forward return to the same page.</li>
          </ul>
        </div>
      </Dialog>

      {confirmNode}
      <ActivityLogDialog open={showLogs} onClose={() => setShowLogs(false)} appearance={appearance} />

      {/* Book Editor Takeover */}
      <AnimatePresence>
        {showEditor && (
          <div className="rp rp-dialog-root rp-editor-root" data-variant="drawer" data-rp-appearance={appearance} style={{ background: "transparent" }}>
            <div className="rp-dialog-scrim" aria-hidden="true" />
            <m.div
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rp-dialog rp-editor-panel"
              role="dialog" aria-modal="true" aria-label={editingBook ? "Edit book" : "New book"}
            >
              <Suspense fallback={<LoadingState label="Opening book editor…" />}>
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
              </Suspense>
            </m.div>
          </div>
        )}
      </AnimatePresence>

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
              <Suspense fallback={<div className="rp" data-rp-appearance={appearance} style={{ height: "100%", display: "grid", placeItems: "center" }}><LoadingState label="Opening Design studio…" /></div>}>
              <StudioEditor
                key={studioLocation?.key}
                initialLocation={studioLocation || undefined}
                appearance={appearance}
                settings={settings}
                onExit={() => setSettingsTab("general")}
                onPersisted={(design: any, published: boolean) =>
                  setSettings((prev: any) => ({ ...prev, draftDesign: design, ...(published ? { design } : {}) }))
                }
              />
              </Suspense>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </ToastProvider>
  );
}
