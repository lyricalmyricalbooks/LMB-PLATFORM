import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Construction, DoorOpen, MoreHorizontal, Search, SlidersHorizontal, X } from "lucide-react";
import { adminApi } from "../api";
import { getOrdersCached } from "../ordersCache";
import { matchCustomers, matchOrders } from "../globalSearch";
import { INVENTORY_APP_URL, inventoryBookUrl, inventorySearchUrl, matchAppBooks, openInventoryApp, type AppBookEntry } from "../appSwitch";
import {
  Dialog, EmptyState, ErrorState, IconButton, LoadingState, SearchField, SecondaryButton, StatusBadge, Tabs,
  type BadgeTone,
} from "./components";

/* ── Global search ───────────────────────────────────────────────────── */

let catalogCache: Promise<any[]> | null = null;
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

export type SearchTarget = { key: string; label: string; kind: string; run: () => void };

/**
 * Combobox over admin destinations plus the book catalog (fetched once, on
 * first focus). Arrow keys move, Enter runs, Escape closes.
 */
/** Opens the inventory app at this address through the app switch (a plain new tab when the switch can't). */
const openInApp = (url: string = INVENTORY_APP_URL) => { if (!openInventoryApp(window, url)) window.open(url, "_blank", "noopener"); };

export function GlobalSearch({ destinations, onOpenBook, onOpenOrder, onOpenCustomer, shortcut = true, appBooks = null, appConnected = false, request }: {
  destinations: Array<{ id: string; label: string; run: () => void }>;
  onOpenBook: (book: any) => void;
  onOpenOrder?: (id: string) => void;
  onOpenCustomer?: (email: string) => void;
  /** Ctrl/Cmd+K focuses the box (off while a full-screen editor with its own shortcut is open). */
  shortcut?: boolean;
  /** The inventory app's books (the link's hourly list), found too and opened in the app. */
  appBooks?: AppBookEntry[] | null;
  /** The inventory app link is connected: offer "Search the inventory app for …". */
  appConnected?: boolean;
  /** Open the search with this text (a `#search=` link from the inventory app); `n` makes a repeat count. */
  request?: { q: string; n: number } | null;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [books, setBooks] = useState<any[] | null>(null);
  // "error" lets the next focus try the catalog read again instead of showing "No matches" forever.
  const [booksState, setBooksState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [orders, setOrders] = useState<any[] | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // The whole catalog (cached for the session) and every order (shared orders cache), loaded on first focus.
  const ensureData = async () => {
    if (!books && booksState !== "loading") {
      setBooksState("loading");
      try {
        if (!catalogCache) catalogCache = adminApi.getAllBooks().catch((e: unknown) => { catalogCache = null; throw e; });
        setBooks(await catalogCache);
        setBooksState("ready");
      } catch { setBooksState("error"); }
    }
    if (onOpenOrder || onOpenCustomer) getOrdersCached().then(setOrders).catch(() => setOrders([]));
  };

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        // Never reach behind an open dialog (book editor, confirm, etc.).
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        setPhoneOpen(true);
        setOpen(true);
        requestAnimationFrame(() => boxRef.current?.querySelector<HTMLInputElement>("input[type='search']")?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  // A link from the inventory app's search: open the box with its text.
  useEffect(() => {
    if (!request?.q) return;
    setQ(request.q);
    setPhoneOpen(true);
    setOpen(true);
    void ensureData();
    requestAnimationFrame(() => boxRef.current?.querySelector<HTMLInputElement>("input[type='search']")?.focus());
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo<SearchTarget[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const nav = destinations
      .filter((d) => d.label.toLowerCase().includes(term))
      .map((d) => ({ key: `nav-${d.id}`, label: d.label, kind: "Go to", run: d.run }));
    const bk = (books || [])
      .filter((b) => [b.title, b.author, b.isbn, b.sku].some((v) => String(v || "").toLowerCase().includes(term)))
      .slice(0, 6)
      .map((b) => ({ key: `book-${b.id}`, label: b.title || "Untitled book", kind: "Book", run: () => onOpenBook(b) }));
    const ord = onOpenOrder ? matchOrders(orders || [], term).map((o) => ({
      key: `order-${o.id}`, label: `${o.orderId || o.id}${o.customer?.name ? ` · ${o.customer.name}` : ""}`, kind: "Order", run: () => onOpenOrder(o.id),
    })) : [];
    const cust = onOpenCustomer ? matchCustomers(orders || [], term).map((c) => ({
      key: `customer-${c.email}`, label: c.name ? `${c.name} · ${c.email}` : c.email, kind: "Customer",
      run: () => onOpenCustomer(c.email),
    })) : [];
    // Only once the website's own books are in, so Enter never jumps to the app while they load.
    const inApp = appConnected && booksState === "ready" ? [
      ...matchAppBooks(appBooks, term).map((b) => ({
        key: `app-${b.id}`, label: b.author ? `${b.title} · ${b.author}` : b.title, kind: APP_KIND, run: () => openInApp(inventoryBookUrl(b.id)),
      })),
      { key: "app-search", label: `Search the inventory app for “${q.trim()}”`, kind: APP_KIND, run: () => openInApp(inventorySearchUrl(q)) },
    ] : [];
    return [...nav, ...bk, ...ord, ...cust, ...inApp];
  }, [q, books, booksState, orders, destinations, onOpenBook, onOpenOrder, onOpenCustomer, appBooks, appConnected]);
  // What this admin found itself (the inventory app rows don't count as "something found").
  const ownCount = results.filter((r) => r.kind !== APP_KIND).length;

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); setPhoneOpen(false); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const input = () => boxRef.current?.querySelector<HTMLInputElement>("input[type='search']");
  const choose = (t?: SearchTarget) => { if (!t) return; t.run(); setQ(""); setOpen(false); setPhoneOpen(false); };
  const close = () => { setOpen(false); setPhoneOpen(false); };
  const showList = open && q.trim().length > 0;
  // Phones show a search button; it opens the box across the whole top bar.
  const openOnPhone = () => { setPhoneOpen(true); setOpen(true); ensureData(); requestAnimationFrame(() => input()?.focus()); };

  return (
    <div className="rp-topbar-search" ref={boxRef} data-open={phoneOpen || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") { const wasPhone = phoneOpen; close(); if (wasPhone) requestAnimationFrame(() => toggleRef.current?.focus()); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); if (showList) choose(results[active]); }
      }}>
      <IconButton ref={toggleRef} label="Search books, orders, customers and admin pages" className="rp-search-toggle"
        aria-expanded={phoneOpen} onClick={openOnPhone}>
        <Search size={20} aria-hidden />
      </IconButton>
      <div className="rp-search-box">
        <SearchField label="Search books, orders, customers and admin screens" placeholder="Search books, orders, customers…" value={q}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-keyshortcuts="Control+K Meta+K"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          onFocus={() => { setOpen(true); ensureData(); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); if (booksState === "error") ensureData(); }} />
        {!q && shortcut && <kbd className="rp-search-kbd" aria-hidden="true">{IS_MAC ? "⌘ K" : "Ctrl K"}</kbd>}
        <IconButton label="Close search" className="rp-search-close" onClick={() => { close(); requestAnimationFrame(() => toggleRef.current?.focus()); }}>
          <X size={18} aria-hidden />
        </IconButton>
      </div>
      {open && !q.trim() && (
        <div className="rp-search-results rp-search-tip" role="note">
          Type a book title, author or ISBN, an order number (with or without #), a customer's name or email, or a page such as <em>Shipping</em>.
          {appConnected && " Books in the inventory app are found too."}
        </div>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="rp-search-results" aria-label="Search results">
          {ownCount === 0 && (
            <li role="option" aria-selected="false" aria-disabled="true"><Search size={14} aria-hidden />{" "}
              {booksState === "loading" || booksState === "idle" ? "Loading…"
                : booksState === "error" ? "Couldn't load books — keep typing to try again" : `Nothing on the website matches “${q.trim()}”`}</li>
          )}
          {results.map((r, i) => (
              <Fragment key={r.key}>
                {r.kind !== results[i - 1]?.kind && <li role="presentation" className="rp-search-group">{GROUP_LABEL[r.kind] || r.kind}</li>}
                <li id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(r); }}>
                  <span className="rp-search-label">{r.label}</span><span className="rp-hint">{r.kind}</span>
                </li>
              </Fragment>
            ))}
        </ul>
      )}
    </div>
  );
}

const APP_KIND = "Inventory app";
const GROUP_LABEL: Record<string, string> = { "Go to": "Admin pages", Book: "Books", Order: "Orders", Customer: "Customers", [APP_KIND]: "In the inventory app" };

/* ── Activity logs ───────────────────────────────────────────────────── */

const LOG_TONES: Record<string, BadgeTone> = {
  catalog: "success", shipping: "danger", campaigns: "warning", settings: "primary", inventory: "info",
};
const CATEGORIES = ["all", "catalog", "shipping", "campaigns", "settings", "inventory"] as const;

export function ActivityLogDialog({ open, onClose, appearance }: { open: boolean; onClose: () => void; appearance: "light" | "dark" }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [term, setTerm] = useState("");

  const load = async () => {
    setLoading(true); setError(false);
    try { setLogs(await adminApi.getAuditLog(100)); } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { if (open) load(); }, [open]);

  const shown = logs.filter((l) =>
    (category === "all" || l.type === category) &&
    (!term.trim() || `${l.message} ${l.type} ${l.actor || ""}`.toLowerCase().includes(term.trim().toLowerCase())));

  return (
    <Dialog open={open} onClose={onClose} size="lg" appearance={appearance}
      title="Activity logs" description="The latest 100 changes made in the admin, newest first. Only you can see this."
      footer={<SecondaryButton onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</SecondaryButton>}>
      <div className="rp-filter-bar">
        <div className="rp-grow"><SearchField label="Search activity" placeholder="Search activity…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      </div>
      <Tabs<(typeof CATEGORIES)[number]> label="Log category" value={category} onChange={setCategory}
        tabs={CATEGORIES.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) }))} />
      <div style={{ marginTop: 16 }}>
        {loading ? <LoadingState label="Loading activity…" />
          : error ? <ErrorState title="Couldn't load the activity log" description="Check your connection, then try again." onRetry={load} />
          : shown.length === 0 ? (logs.length === 0
            ? <EmptyState title="Nothing recorded yet" description="Changes to books, shipping, discounts, settings and stock appear here as you make them." />
            : <EmptyState title="No matching activity" description="Try another category or search word." />)
          : (
            <ul className="rp-list" aria-label="Activity entries">
              {shown.map((log) => {
                const d = new Date(log.createdAt);
                const valid = !isNaN(d.getTime());
                return (
                  <li key={log.id} style={{ padding: "14px 0" }}>
                    <div className="rp-row-meta" style={{ marginBottom: 6 }}>
                      <StatusBadge tone={LOG_TONES[log.type] || "neutral"}>{log.type}</StatusBadge>
                      <time className="rp-mono" dateTime={valid ? d.toISOString() : undefined}>
                        {valid ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : String(log.createdAt)}
                      </time>
                      {log.actor && <span>by {String(log.actor)}</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--rp-text-base)", lineHeight: 1.5, overflowWrap: "anywhere" }}>{log.message}</p>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </Dialog>
  );
}

/* ── Shop status (top bar) ───────────────────────────────────────────── */

/**
 * One top-bar control for "is the shop open?": a status word with a glyph, opening a small menu
 * that closes or opens the shop (the under-construction wall; the caller asks to confirm) and
 * links to Settings › General › Store status.
 */
export function ShopStatusMenu({ wallOn, checkoutPaused, busy, disabled, onSetWall, onOpenSettings }: {
  wallOn: boolean; checkoutPaused: boolean; busy?: boolean; disabled?: boolean;
  onSetWall: (on: boolean) => void; onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const state = wallOn ? "closed" : checkoutPaused ? "paused" : "open";
  const word = { closed: "Shop closed", paused: "Checkout paused", open: "Shop open" }[state];
  const glyph = { closed: "⚠", paused: "⚠", open: "●" }[state];
  const detail = {
    closed: "Shoppers see the “under construction” wall instead of your books.",
    paused: "Shoppers can browse, but checkout is closed for maintenance.",
    open: "Shoppers can browse and buy.",
  }[state];
  const pick = (fn: () => void) => { setOpen(false); btn.current?.focus(); fn(); };
  return (
    <div className="rp-menu-wrap" ref={wrap}
      onKeyDown={(e) => {
        if (!open) return;
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
        else if (e.key === "Tab") setOpen(false);
      }}>
      <button ref={btn} type="button" className="rp-status-pill rp-status-btn" data-tone={state === "open" ? undefined : "warning"}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled}
        aria-label={`${word}. Change shop status`} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true" className="rp-status-glyph">{glyph}</span>
        <span className="rp-status-word">{busy ? "Saving…" : word}</span>
        <span className="rp-status-short" aria-hidden="true">{busy ? "Saving…" : { closed: "Closed", paused: "Paused", open: "Open" }[state]}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="rp-menu rp-status-menu" role="menu" id={menuId} aria-label="Shop status">
          <div className="rp-menu-label"><strong>{word}.</strong> {detail}</div>
          {wallOn
            ? <button type="button" role="menuitem" className="rp-menu-item" disabled={busy} onClick={() => pick(() => onSetWall(false))}>
              <DoorOpen size={16} aria-hidden /> Open the shop
            </button>
            : <button type="button" role="menuitem" className="rp-menu-item" data-tone="danger" disabled={busy} onClick={() => pick(() => onSetWall(true))}>
              <Construction size={16} aria-hidden /> Close the shop (under construction)
            </button>}
          <button type="button" role="menuitem" className="rp-menu-item" onClick={() => pick(onOpenSettings)}>
            <SlidersHorizontal size={16} aria-hidden /> Store status settings
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Account row at the foot of the phone drawer ─────────────────────── */

/**
 * Phones (Pocket Pressroom, 23 October 2026): the top bar has no room for the avatar, so the drawer ends with
 * the administrator (avatar, name, View site) and a ⋯ menu holding the same actions as the top-bar avatar menu.
 */
export function DrawerAccount({ avatar, name, email, onViewSite, menuItems }: {
  avatar: ReactNode; name: string; email: string; onViewSite: () => void;
  menuItems: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    // A native listener: the drawer's focus trap closes the whole drawer on Escape before React's handlers run.
    const node = wrap.current;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    node?.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); node?.removeEventListener("keydown", esc); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="rp-drawer-account" ref={wrap}
      onKeyDown={(e) => {
        if (!open) return;
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      }}>
      {avatar}
      <span className="rp-drawer-account-name" title={email}>{name}</span>
      <button type="button" className="rp-drawer-account-site" onClick={onViewSite}>View site</button>
      <button ref={btn} type="button" className="rp-icon-btn" aria-label="Account actions" aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open && (
        <div className="rp-menu rp-drawer-account-menu" role="menu" id={menuId}>
          <div className="rp-menu-label">{email}</div>
          {menuItems(close)}
        </div>
      )}
    </div>
  );
}
