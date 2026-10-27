import { Component, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical, Maximize2, Pencil, Plus, RefreshCw } from "lucide-react";
import {
  ActionMenu, CardInWidget, Checkbox, PageAlertsSlot, Dialog, EmptyState, GhostButton, IconButton, PrimaryButton, SearchField, SecondaryButton,
  SelectField, StatusBadge, Tabs, TextField, useConfirm, usePrompt, useRisoToast, type MenuAction,
} from "../riso/components";
import {
  BANDS, FIGURES, HEIGHTS, MAX_BOARDS, SIZES, TEMPLATES, WIDGETS, activeBoard, addBoard, addWidget, collapseEverything,
  copyBoard, countOf, defaultStore, deleteBoard, duplicateWidget, findWidget, makeWidget, moveBand, moveWidget, moveWidgetTo, removeWidget,
  renameBoard, renameWidget, replaceBoard, resetBoard, restoreWidget, revealWidget, sameView, selectBoard, setBoardView, setWidgetConfig, updateBand, updateWidget, visibleBands,
  widgetMeta, widgetTitle, canAdd,
  type BandId, type Board, type BoardBand, type BoardStore, type BoardView, type BoardWidget, type ChartGrain, type FigureId, type TemplateId, type WidgetConfig,
  type WidgetHeight, type WidgetMeta, type WidgetSize, type WidgetType,
} from "./overviewBoard";
import { CHART_METRICS, type ChartMetric } from "./overviewSeries";
import { readLocalBoards, readRemoteBoards, writeLocalBoards, writeRemoteBoards } from "./overviewBoardStore";
import { OVERVIEW_HASH_EVENT } from "../adminRoute";
import {
  DEFAULT_TAB, hashForTab, readSavedTab, saveTab, settleTab, tabForType, tabFromHash, topTabs,
  type OverviewTab, type TopTab,
} from "./overviewTabs";

export type SaveState = "loading" | "saving" | "saved" | "local" | "error";
export type RenderWidget = (w: BoardWidget, opts: { full: boolean; setConfig: (patch: WidgetConfig) => void }) => ReactNode;

/**
 * The boards, kept in this browser at once and in the owner's account a moment later. The account copy is read
 * once on open and replaces this browser's copy only when it is newer and nothing was changed here yet.
 */
export function useBoardStore() {
  const [store, setState] = useState<BoardStore>(() => readLocalBoards() || defaultStore(0));
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState("");
  const latest = useRef(store);
  // The copy this browser started from: an account copy newer than it wins, even over a change made while it loaded.
  const startedAt = useRef(store.updatedAt);
  const readDone = useRef(false);
  const pending = useRef(false);
  const timer = useRef<number | null>(null);

  const upload = useCallback(() => {
    timer.current = null;
    pending.current = false;
    setSaveState("saving");
    writeRemoteBoards(latest.current).then(() => { if (!pending.current) setSaveState("saved"); setSaveError(""); })
      .catch((err: any) => { setSaveState("error"); setSaveError(err?.message || "Couldn't save to your account."); });
  }, []);
  const schedule = useCallback(() => {
    pending.current = true;
    setSaveState("saving");
    // Nothing goes up before the account copy has been read, so an old browser copy never overwrites a newer one.
    if (!readDone.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(upload, 1200);
  }, [upload]);

  useEffect(() => {
    let live = true;
    readRemoteBoards().then(remote => {
      if (!live) return;
      readDone.current = true;
      if (remote && remote.updatedAt > startedAt.current) {
        // Newer on the account (another device): take it. A change made in the moment before it arrived is dropped.
        pending.current = false;
        latest.current = remote; setState(remote); writeLocalBoards(remote);
        setSaveState("saved");
      } else if (pending.current || (latest.current.updatedAt > 0 && (!remote || latest.current.updatedAt > remote.updatedAt))) {
        // This browser holds changes the account hasn't got (edited just now, or a save that never went up last time).
        schedule();
      } else setSaveState("saved");
    }).catch(() => { if (live) { readDone.current = true; setSaveState("local"); } });
    return () => { live = false; };
  }, [schedule]);

  const setStore = useCallback((next: BoardStore) => {
    latest.current = next;
    setState(next);
    writeLocalBoards(next);
    schedule();
  }, [schedule]);
  // Leaving the Overview, or closing the tab, with a save still waiting sends it straight away. If that fails, the
  // browser copy is newer than the account's next time, and the read above sends it up then.
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return;
      window.clearTimeout(timer.current); timer.current = null;
      writeRemoteBoards(latest.current).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);
  return { store, setStore, saveState, saveError, retrySave: upload };
}


type Focus = { kind: "widget"; id: string } | { kind: "type"; type: WidgetType } | { kind: "band"; band: BandId } | null;
const bandMeta = (id: BandId) => BANDS.find(b => b.id === id)!;
const SAVE_WORDS: Record<SaveState, string> = {
  loading: "Opening your boards…", saving: "Saving…", saved: "✓ Saved to your account", local: "⚠ Saved on this browser only", error: "✕ Not saved to your account",
};

/** Widths and heights in plain words (the S · M · L · XL letters stay only as a small visual mark). */
export const SIZE_WORDS: Record<WidgetSize, { name: string; hint: string }> = {
  s: { name: "Narrow", hint: "a third of the row" }, m: { name: "Half", hint: "half the row" },
  l: { name: "Wide", hint: "two thirds of the row" }, xl: { name: "Full width", hint: "the whole row" },
};
export const HEIGHT_WORDS: Record<WidgetHeight, { name: string; hint: string }> = {
  auto: { name: "Normal", hint: "as tall as its content" }, short: { name: "Short", hint: "scrolls inside" }, tall: { name: "Tall", hint: "scrolls inside" },
};
const GRAIN_WORDS: Record<ChartGrain, string> = { auto: "Pick for me", day: "Each day", week: "Each week", month: "Each month" };

/** Widgets added on 20 October 2026: marked "New" in Add widgets until the owner has opened it once. */
export const NEW_WIDGETS: WidgetType[] = ["navLinks", "bookPage", "notFound", "filters", "bagPeek", "readDepth", "journeys", "exitPages", "clarity"];
const SEEN_KEY = "lm:overview-seen-widgets";
function readSeen(): string[] { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function writeSeen(types: string[]) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(types)); } catch { /* private window: the dot just shows again */ } }

/** Unused widgets most shops want, offered first in Add widgets. */
const SUGGESTED: WidgetType[] = ["needs", "newest", "chart", "figures", "best", "money", "reprint", "low", "checkout", "funnel", "top", "missed"];

/** The owner's own words for each widget, so "money", "reprint" or "instagram" finds it. */
export const WIDGET_KEYWORDS: Partial<Record<WidgetType, string>> = {
  needs: "to do todo ship orders tasks waiting inbox", changes: "moves up down biggest compare", newest: "latest recent orders sales list",
  readiness: "launch checks setup ready checklist", live: "now right now live visitors people online realtime bag",
  story: "headline summary sentence pace", chart: "graph line trend revenue sales over time", figures: "numbers kpi totals stats key",
  best: "top selling bestsellers popular books revenue", money: "revenue breakdown discounts shipping tax refunds gift cards waterfall",
  formats: "print digital ebook e-book hardcover paperback", countries: "countries readers where destination shipping places",
  categories: "category genre collections", weekdays: "day of week busiest days", hours: "time hour when to post launch heatmap",
  fulfilment: "shipping speed payments paypal stripe card", codes: "discount coupon promo code sale",
  calendar: "year heatmap days fair launch bursts", goal: "target month money aim pace budget", notes: "post fair instagram newsletter event marker annotate",
  shipDays: "shipping speed parcels post dispatch slow", titles: "every book table csv download list catalog",
  viewed: "views product pages popular looked", launches: "new book release first 30 days compare", bookOfWeek: "best week top book star",
  signed: "signature autograph signed copies", gaKpis: "google analytics visitors sessions engagement", channels: "social search email google instagram facebook referral",
  gaSources: "google sources sites referrers campaign", landing: "first page entry google", gaPages: "page views google pages",
  gaCountries: "google countries visitors", gaDevices: "google phone mobile computer tablet", funnel: "conversion bag checkout purchase steps",
  checkout: "abandon drop off checkout steps lost", sources: "where visits come from instagram newsletter referral orders",
  campaigns: "utm links newsletter instagram ads campaign", landingSales: "entry page buyers", devices: "phone mobile computer tablet",
  searches: "search box terms looked for", missed: "no results not found wanted", google: "seo search console clicks ranking",
  googleQueries: "seo search console keywords queries", googlePages: "seo search console pages results", speed: "slow fast loading performance vitals",
  counter: "reset traffic counting since", custKpis: "customers repeat lifetime value subscribers", retention: "come back repeat loyalty cohort",
  top: "best customers vip spend", carts: "abandoned bag left email", reminders: "abandoned cart reminder email worked",
  newsletter: "subscribers mailing list sign-ups email", reviews: "ratings stars reader reviews", map: "cities where orders come from geography",
  giftOwed: "gift cards balance owed liability", stockKpis: "inventory shelf value stock", reprint: "running out reprint print run",
  wanted: "sold out coming soon demand", backInStock: "waiting list notify restock", slow: "not selling dead stock old",
  moves: "path journey navigation next page flow clicks through referrer", firstPage: "landing entry first page bounce journey instagram channel",
  sectionClicks: "home page sections lists click rate book cards studio shop grid search related recently viewed", deviceSteps: "phone mobile computer funnel steps checkout compare",
  navLinks: "menu navigation header footer phone links clicks nav", bookPage: "product page tabs photos gallery edition share details reviews interact",
  notFound: "404 broken links missing page not found redirect old address", filters: "filter format price in stock catalog shop grid choices",
  journeys: "journeys paths sequence flow bigquery route", exitPages: "exit leave last page bounce bigquery",
  clarity: "clarity heatmap heatmaps recordings sessions clicks scroll microsoft",
  bagPeek: "cart bag opened peek checkout abandon", readDepth: "scroll depth read to the end halfway bottom attention",
  low: "running out low stock few copies", preorders: "pre-order promised release print run", soldOut: "reprint running out countdown sold out days",
};

/**
 * Add widgets search: every word must appear in the widget's title, blurb, topic or keywords; title hits come first.
 * An empty search returns every widget in catalog order.
 */
export function searchWidgets(query: string): WidgetMeta[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return WIDGETS.slice();
  const scored: Array<{ w: WidgetMeta; score: number; i: number }> = [];
  WIDGETS.forEach((w, i) => {
    const title = w.title.toLowerCase();
    const hay = `${title} ${w.blurb} ${bandMeta(w.band).title} ${WIDGET_KEYWORDS[w.type] || ""}`.toLowerCase();
    // A trailing "s" is forgiven ("refunds" finds "refund", "books" finds "book").
    const has = (text: string, word: string) => text.includes(word) || (word.length > 3 && word.endsWith("s") && text.includes(word.slice(0, -1)));
    if (!words.every(word => has(hay, word))) return;
    const score = words.reduce((n, word) => n + (has(title, word) ? 2 : 0), 0);
    scored.push({ w, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.w);
}

const SPAN_DESK: Record<WidgetSize, number> = { s: 4, m: 6, l: 8, xl: 12 };
const SPAN_TABLET: Record<WidgetSize, number> = { s: 6, m: 6, l: 12, xl: 12 };
/**
 * Rows that don't add up to 12 columns leave a hole: the last widget of each such row grows to fill it. Returns,
 * per widget, the span it should take, or null when its own size already ends the row.
 */
export function rowFills(sizes: WidgetSize[], spans: Record<WidgetSize, number> = SPAN_DESK): Array<number | null> {
  const out: Array<number | null> = sizes.map(() => null);
  let col = 0;
  sizes.forEach((size, i) => {
    const s = spans[size];
    if (col > 0 && col + s > 12) { out[i - 1] = spans[sizes[i - 1]] + 12 - col; col = 0; }
    col += s;
    if (col >= 12) col = 0;
  });
  if (col > 0 && sizes.length) out[sizes.length - 1] = spans[sizes[sizes.length - 1]] + 12 - col;
  return out;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

/** A widget that throws shows a small notice with Try again, instead of taking the whole Overview down. */
class WidgetBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn(`Overview widget “${this.props.name}” failed`, err, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rp-wb-failed" role="alert">
        <span><span aria-hidden="true">✕ </span>Couldn't show “{this.props.name}”.</span>
        <button type="button" className="rp-wb-a" onClick={() => this.setState({ failed: false })}>Try again</button>
      </div>
    );
  }
}

/** What the Overview puts in the board's header: the period controls and the words around them. */
export type BoardHeader = {
  /** "Updated 9:41 · auto every 5 min" */
  updated: ReactNode;
  /** The period buttons and the comparison select. */
  period: ReactNode;
  /** The period in words (a note under the strip only when something needs saying). */
  summary: ReactNode;
  /** The headline numbers strip (revenue, orders, visitors, conversion). */
  figures?: ReactNode;
  /** The period's name ("the last 12 months"), for "Open this board on these dates". */
  viewName: string;
  view: BoardView;
  onApplyView: (v: BoardView) => void;
  onExport: () => void; exportReady: boolean;
  onRefresh: () => void; refreshing: boolean;
};

/** Arrow keys move between the period buttons (one tab stop for the whole strip, like a radio group). */
function periodKeys(e: ReactKeyboardEvent<HTMLDivElement>) {
  const btn = (e.target as HTMLElement).closest?.(".rp-wb-seg button") as HTMLButtonElement | null;
  if (!btn) return;
  const all = Array.from(btn.parentElement?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
  const i = all.indexOf(btn);
  const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? all[(i + 1) % all.length]
    : e.key === "ArrowLeft" || e.key === "ArrowUp" ? all[(i - 1 + all.length) % all.length]
    : e.key === "Home" ? all[0] : e.key === "End" ? all[all.length - 1] : null;
  if (!to) return;
  e.preventDefault();
  to.click(); to.focus();
}

export function OverviewBoard({ store, setStore, saveState, saveError, onRetrySave, renderWidget, header }: {
  store: BoardStore; setStore: (s: BoardStore) => void; saveState: SaveState; saveError: string; onRetrySave: () => void;
  renderWidget: RenderWidget; header: BoardHeader;
}) {
  const board = activeBoard(store);
  const say = useRisoToast();
  const [confirm, confirmNode] = useConfirm();
  const [prompt, promptNode] = usePrompt();
  const [editing, setEditing] = useState(false);
  const [past, setPast] = useState<BoardStore[]>([]);
  const [future, setFuture] = useState<BoardStore[]>([]);
  const [tray, setTray] = useState<{ open: boolean; band: BandId | "all" }>({ open: false, band: "all" });
  const [focus, setFocus] = useState<Focus>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [seen, setSeen] = useState<string[]>(readSeen);
  const [drag, setDragState] = useState<{ id: string; over: string | null } | null>(null);
  // Drag handlers read the ref: the first dragover can fire before React has re-rendered with the new state.
  const dragRef = useRef<{ id: string; over: string | null } | null>(null);
  const setDrag = (d: { id: string; over: string | null } | null) => { dragRef.current = d; setDragState(d); };
  const [tempConfig, setTempConfig] = useState<Record<string, WidgetConfig>>({});
  const scrollBack = useRef(0);
  // The widget (or topic) full view was opened from, to come back to it.
  const returnTo = useRef<string | null>(null);
  const periodRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // The Board menu closes on a click outside it.
  useEffect(() => {
    if (!boardMenuOpen) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (boardRef.current?.contains(t) || (t as Element).closest?.(".rp-menu, .rp-dialog")) return;
      setBoardMenuOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [boardMenuOpen]);
  const unseenNew = NEW_WIDGETS.some(t => !seen.includes(t));
  // The open sub tab: the address names it (#overview/visitors/move), else the one used last in this browser.
  const [askedTab, setAskedTab] = useState<OverviewTab>(() => tabFromHash(typeof window !== "undefined" ? window.location.hash : "") || readSavedTab() || DEFAULT_TAB);
  const tab = settleTab(askedTab, board, editing);
  const openTab = useCallback((next: OverviewTab, how: "push" | "replace" = "push") => {
    setAskedTab(next);
    saveTab(next);
    const hash = hashForTab(next);
    if (typeof window === "undefined" || window.location.hash === hash) return;
    const url = window.location.pathname + window.location.search + hash;
    if (how === "push") history.pushState(null, "", url); else history.replaceState(null, "", url);
    window.dispatchEvent(new Event(OVERVIEW_HASH_EVENT));
  }, []);

  // Every change goes through here, so Undo/Redo cover it.
  const commitStore = useCallback((next: BoardStore) => {
    if (next === store) return;
    setPast(p => [...p.slice(-39), store]);
    setFuture([]);
    setStore(next);
  }, [store, setStore]);
  const commit = useCallback((fn: (b: Board) => Board) => {
    const next = fn(board);
    if (next !== board) commitStore(replaceBoard(store, next));
  }, [board, store, commitStore]);
  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(p => p.slice(0, -1)); setFuture(f => [store, ...f]);
    setStore({ ...prev, updatedAt: Date.now() });
    setAnnounce("Undone");
  }, [past, store, setStore]);
  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture(f => f.slice(1)); setPast(p => [...p, store]);
    setStore({ ...next, updatedAt: Date.now() });
    setAnnounce("Redone");
  }, [future, store, setStore]);

  // The address always names the tab on screen (also when the asked-for one isn't on this board).
  const tabHash = hashForTab(tab);
  const tabHashRef = useRef(tabHash);
  tabHashRef.current = tabHash;
  const nameTabInAddress = useCallback(() => {
    if (!/^#overview(\/|$)/.test(window.location.hash) || window.location.hash === tabHashRef.current) return;
    history.replaceState(null, "", window.location.pathname + window.location.search + tabHashRef.current);
    window.dispatchEvent(new Event(OVERVIEW_HASH_EVENT));
  }, []);
  // Back/Forward between tabs, and a link to another tab while the Overview is open. A bare #overview (an older
  // history entry) is renamed to the tab on screen.
  useEffect(() => {
    const onHash = () => {
      const t = tabFromHash(window.location.hash);
      if (t) setAskedTab(t);
      else if (window.location.hash === "#overview") nameTabInAddress();
    };
    window.addEventListener("popstate", onHash);
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("popstate", onHash); window.removeEventListener("hashchange", onHash); };
  }, [nameTabInAddress]);
  // After Dashboard's own address write: child effects run first, so on a return to the Overview Dashboard would
  // otherwise push a bare #overview over the tab this wrote.
  useEffect(() => {
    if (focus) return;
    const t = window.setTimeout(nameTabInAddress, 0);
    return () => window.clearTimeout(t);
  }, [tabHash, focus, nameTabInAddress]);

  // A toast's action runs later, so it reaches the board as it is then, not as it was when the toast was made.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // A board with a saved period opens on it, each time it is picked (and when the Overview opens on it).
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (appliedFor.current === board.id) return;
    appliedFor.current = board.id;
    if (board.view && !sameView(board.view, header.view)) header.onApplyView(board.view);
  }, [board.id, board.view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "");
      if (e.key === "Escape" && focus && !document.querySelector("[role=dialog]") && !(e.target as HTMLElement)?.closest?.(".rp-menu-wrap")) { e.preventDefault(); closeFocus(); return; }
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || (!past.length && !future.length)) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The period strip is one tab stop: only the chosen period is reachable by Tab, arrows move between the others.
  useEffect(() => {
    periodRef.current?.querySelectorAll<HTMLButtonElement>(".rp-wb-seg button").forEach(b => {
      b.tabIndex = b.getAttribute("aria-pressed") === "true" ? 0 : -1;
    });
  });

  useEffect(() => {
    if (!flash) return;
    const el = document.getElementById(`wb-${flash}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash]);

  // Full view: the heading takes focus, so a screen reader says where it landed.
  useEffect(() => {
    if (!focus) return;
    const h = document.getElementById(focus.kind === "band" ? "wb-more-title" : "wb-full-title");
    h?.focus({ preventScroll: true });
  }, [focus]);

  const openFocus = (f: Exclude<Focus, null>) => {
    if (!focus) {
      scrollBack.current = window.scrollY;
      returnTo.current = f.kind === "widget" ? `wb-${f.id}` : f.kind === "band" ? `wb-band-${f.band}` : null;
    }
    setFocus(f); window.scrollTo({ top: 0 });
  };
  function closeFocus() {
    setFocus(null);
    requestAnimationFrame(() => {
      const el = returnTo.current ? document.getElementById(returnTo.current) : null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        (el.querySelector<HTMLElement>(".rp-wb-max") || el.querySelector<HTMLElement>("h2 button, h3"))?.focus({ preventScroll: true });
      } else window.scrollTo({ top: scrollBack.current });
    });
  }

  const position = (b: Board, wid: string) => {
    const f = findWidget(b, wid);
    if (!f) return "";
    const i = f.band.widgets.findIndex(x => x.id === wid);
    return `${ordinal(i + 1)} of ${f.band.widgets.length} in ${bandMeta(f.band.id).title}`;
  };
  const move = (w: BoardWidget, delta: number) => {
    const next = moveWidget(board, w.id, delta);
    commit(() => next);
    setAnnounce(`Moved ${widgetTitle(w)} to ${position(next, w.id)}`);
  };

  /** Shows the tab a widget of this type lives under, unless it is already on screen there (or on Everything). */
  const goToType = (type: WidgetType) => {
    const want = tabForType(type);
    if (tab.band === "all" || (tab.band === want.band && (tab.sub === "all" || tab.sub === want.sub))) return;
    openTab(want);
  };

  /** Adds a widget (or, for one already on the board, shows it). From the tray it stays quiet: the tray says so itself. */
  const add = (type: WidgetType, config?: WidgetConfig, opts: { fromTray?: boolean } = {}): string | null => {
    const meta = widgetMeta(type);
    const { board: added, id } = addWidget(board, type, config);
    if (!id) {
      // Already on the board (a single-copy widget): open its topic and unfold it so "Show it" really shows it.
      const existing = board.bands.flatMap(b => b.widgets).find(w => w.type === type);
      if (existing) { commit(b => updateBand(revealWidget(b, existing.id), meta.band, { hidden: false })); if (!opts.fromTray) { goToType(type); setFlash(existing.id); } }
      return existing?.id || null;
    }
    // A widget added to a hidden topic shows that topic again, or it would vanish.
    commit(() => updateBand(added, meta.band, { hidden: false }));
    goToType(type);
    if (opts.fromTray) return id;
    setFlash(id);
    say(`Added “${meta.title}” to ${bandMeta(meta.band).title}`, { tone: "ok" });
    return id;
  };
  const showWidget = (id: string) => {
    setTray(t => ({ ...t, open: false }));
    const f = findWidget(board, id);
    if (f) goToType(f.widget.type);
    if (f && (f.widget.collapsed || f.band.collapsed)) commit(b => revealWidget(b, id));
    setFlash(id);
  };
  const remove = (w: BoardWidget) => {
    const index = findWidget(board, w.id)?.band.widgets.findIndex(x => x.id === w.id) ?? 0;
    commit(b => removeWidget(b, w.id));
    // This Undo brings back this widget only, whatever was changed after it. Undo at the top of the board stays too.
    say(`Removed “${widgetTitle(w)}” from the board`, { tone: "warn", actionLabel: "Undo", onAction: () => commitRef.current(b => restoreWidget(b, w, index)) });
  };
  const rename = async (w: BoardWidget) => {
    const name = await prompt({ title: "Rename this widget", label: "Name (leave empty for the usual name)", defaultValue: w.title || "", confirmLabel: "Rename" });
    if (name !== null) commit(b => renameWidget(b, w.id, name));
  };
  const fold = (w: BoardWidget, collapsed: boolean) => {
    commit(b => updateWidget(b, w.id, { collapsed }));
    setAnnounce(`${collapsed ? "Folded" : "Unfolded"} ${widgetTitle(w)}`);
  };
  const resize = (w: BoardWidget, size: WidgetSize) => {
    commit(b => updateWidget(b, w.id, { size }));
    setAnnounce(`${widgetTitle(w)} is now ${SIZE_WORDS[size].name.toLowerCase()}`);
  };
  const renameThisBoard = async () => {
    const name = await prompt({ title: "Rename this board", label: "Board name", defaultValue: board.name, confirmLabel: "Rename" });
    if (name && name.trim()) commitStore(renameBoard(store, board.id, name));
  };
  const deleteThisBoard = async () => {
    if (!(await confirm({ title: `Delete “${board.name}”?`, message: "Only this board is deleted. Your orders, figures and other boards are not touched.", confirmLabel: "Delete board" }))) return;
    commitStore(deleteBoard(store, board.id));
  };
  const resetThisBoard = async () => {
    const t = TEMPLATES.find(x => x.id === board.template)!;
    if (!(await confirm({ title: `Put “${board.name}” back to the ${t.name} board?`, message: "Widgets you added, moved, resized or renamed on this board go back to how it starts. You can press Undo straight after.", confirmLabel: "Reset board" }))) return;
    commitStore(resetBoard(store, board.id));
  };

  const saveView = () => {
    commit(b => setBoardView(b, header.view));
    say(`“${board.name}” now opens on ${header.viewName}`, { actionLabel: "Undo", onAction: () => commitRef.current(b => setBoardView(b, board.view || null)) });
  };
  const forgetView = () => commit(b => setBoardView(b, null));
  const openTray = (band: BandId | "all") => {
    setTray({ open: true, band });
    if (unseenNew) { const all = Array.from(new Set([...seen, ...NEW_WIDGETS])); setSeen(all); writeSeen(all); }
  };

  const allFolded = board.bands.every(b => b.collapsed || b.widgets.every(w => w.collapsed));
  const bands = visibleBands(board, editing);
  // The bands and widgets the open tab shows. Editing shows a whole topic, so moving a widget never skips hidden ones.
  const shownBands = tab.band === "all" ? bands : bands.filter(b => b.id === tab.band);
  const shownWidgets = (band: BoardBand) => band.widgets;
  const hiddenBands = board.bands.filter(b => b.hidden);
  const widgetCount = board.bands.reduce((n, b) => n + b.widgets.length, 0);

  const sizeButtons = (w: BoardWidget) => (
    <span className="rp-wb-sizes" role="group" aria-label={`Width of ${widgetTitle(w)}`}>
      {SIZES.map(s => (
        <button key={s.id} type="button" aria-pressed={w.size === s.id} title={`${SIZE_WORDS[s.id].name} (${SIZE_WORDS[s.id].hint})`}
          aria-label={SIZE_WORDS[s.id].name} onClick={() => resize(w, s.id)}>{s.label}</button>
      ))}
    </span>
  );

  // ⋯ on a widget: its settings first, Remove last. Width and height live in Settings…, moving only while editing.
  const menuFor = (w: BoardWidget, index: number, total: number): MenuAction[] => {
    const meta = widgetMeta(w.type);
    const list: MenuAction[] = [
      { label: "Settings…", onSelect: () => setSettingsFor(w.id) },
      { label: "Bigger view", onSelect: () => openFocus({ kind: "widget", id: w.id }) },
      { label: "Rename…", onSelect: () => rename(w) },
    ];
    if (meta.multi) list.push({ label: "Duplicate", onSelect: () => { const r = duplicateWidget(board, w.id); if (r.id) { commit(() => r.board); setFlash(r.id); } } });
    list.push({ label: w.collapsed ? "Unfold" : "Fold to its title", onSelect: () => fold(w, !w.collapsed) });
    if (editing && index > 0) list.push({ label: "Move earlier", onSelect: () => move(w, -1) });
    if (editing && index < total - 1) list.push({ label: "Move later", onSelect: () => move(w, 1) });
    list.push({ label: "Remove from board", tone: "danger", onSelect: () => remove(w) });
    return list;
  };

  /** One widget: its bar (fold, title, bigger view, menu; in edit mode grip, move and width) and its content. */
  const frame = (w: BoardWidget, opts: { index: number; total: number; explore?: boolean; fill?: [number | null, number | null] }) => {
    const title = widgetTitle(w);
    const meta = widgetMeta(w.type);
    const onBoard = !opts.explore || !!findWidget(board, w.id);
    const live = onBoard && !opts.explore;
    const setConfig = (patch: WidgetConfig) => (live || findWidget(board, w.id) ? commit(b => setWidgetConfig(b, w.id, patch)) : setTempConfig(c => ({ ...c, [w.id]: { ...(c[w.id] || w.config || {}), ...patch } })));
    const shown = !live && tempConfig[w.id] ? { ...w, config: tempConfig[w.id] } : w;
    const folded = live && !!w.collapsed;
    const bodyId = `wb-body-${w.id}`;
    const isDragging = drag?.id === w.id;
    const dropHere = drag && drag.over === w.id && drag.id !== w.id;
    const [fillD, fillT] = opts.fill || [null, null];
    const fillStyle = { ...(fillD ? { "--wb-fill-d": `span ${fillD}` } : {}), ...(fillT ? { "--wb-fill-t": `span ${fillT}` } : {}) } as CSSProperties;
    return (
      <article key={w.id} id={`wb-${w.id}`} className="rp-wb-widget" data-size={w.size} data-height={w.height} data-folded={folded || undefined}
        data-live={live || undefined} data-fill-d={fillD || undefined} data-fill-t={fillT || undefined} style={fillStyle}
        data-flash={flash === w.id || undefined} data-dragging={isDragging || undefined} data-drop={dropHere || undefined} aria-labelledby={`wb-title-${w.id}`}
        onDragOver={e => { const d = dragRef.current; if (!d || d.id === w.id || findWidget(board, d.id)?.band.id !== meta.band) return; e.preventDefault(); if (d.over !== w.id) setDrag({ ...d, over: w.id }); }}
        onDrop={e => {
          const d = dragRef.current; if (!d) return; e.preventDefault();
          const next = moveWidgetTo(board, d.id, w.id); commit(() => next); setDrag(null);
          const moved = findWidget(next, d.id)?.widget;
          if (moved) setAnnounce(`Moved ${widgetTitle(moved)} to ${position(next, d.id)}`);
        }}>
        <header className="rp-wb-bar">
          {editing && live && (
            <span className="rp-wb-grip" title="Drag to move within this topic" aria-hidden="true" draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w.id);
                const card = e.currentTarget.closest("article");
                if (card) e.dataTransfer.setDragImage(card, 24, 20);
                setDrag({ id: w.id, over: null });
              }}
              onDragEnd={() => setDrag(null)}><GripVertical size={16} /></span>
          )}
          {live && (
            <button type="button" className="rp-wb-fold" aria-expanded={!folded} aria-controls={bodyId} aria-label={`${folded ? "Unfold" : "Fold"} ${title}`}
              onClick={() => fold(w, !folded)}>
              <ChevronRight size={16} aria-hidden style={{ transform: folded ? "none" : "rotate(90deg)" }} />
            </button>
          )}
          <h3 className="rp-wb-title" id={`wb-title-${w.id}`}>{title}</h3>
          {meta.google && <span className="rp-wb-tag" title="Counted by Google Analytics, which also counts people who block the shop's own counter.">From Google</span>}
          <span className="rp-wb-tools">
            {editing && live && (
              <>
                <span className="rp-wb-move">
                  <IconButton label={`Move ${title} earlier`} disabled={opts.index === 0} onClick={() => move(w, -1)}><span aria-hidden="true">←</span></IconButton>
                  <IconButton label={`Move ${title} later`} disabled={opts.index >= opts.total - 1} onClick={() => move(w, 1)}><span aria-hidden="true">→</span></IconButton>
                </span>
                {sizeButtons(w)}
              </>
            )}
            {!live && (!onBoard && canAdd(board, w.type)
              ? <SecondaryButton size="sm" onClick={() => add(w.type, tempConfig[w.id] || w.config)}><Plus size={14} aria-hidden /> Add to board</SecondaryButton>
              : <StatusBadge tone="success">On your board</StatusBadge>)}
            <IconButton className="rp-wb-max" label={`Bigger view of ${title}`}
              onClick={() => openFocus(live || (onBoard && findWidget(board, w.id)) ? { kind: "widget", id: w.id } : { kind: "type", type: w.type })}><Maximize2 size={15} aria-hidden /></IconButton>
            {live && <ActionMenu label={`More for ${title}`} actions={menuFor(w, opts.index, opts.total)} />}
          </span>
        </header>
        {!folded && (
          <div id={bodyId} className="rp-wb-body">
            <WidgetBoundary name={title}>
              <CardInWidget.Provider value={true}>{renderWidget(shown, { full: false, setConfig })}</CardInWidget.Provider>
            </WidgetBoundary>
          </div>
        )}
      </article>
    );
  };

  // The header (Pressroom, 22 October 2026): the title with the period beside it, then the topic tabs, then the
  // figures with one line under them (which dates, when they were updated). The Board menu sits with the tab actions.
  const viewSaved = sameView(board.view, header.view);
  const pageAlerts = useContext(PageAlertsSlot);
  const head = (
    <>
      <header className="rp-wb-head">
        <div className="rp-wb-head-title">
          <h1 className="rp-page-title rp-wb-h1">Overview</h1>
          <div className="rp-wb-period" ref={periodRef} role="group" aria-label="Period and comparison" onKeyDown={periodKeys}>{header.period}</div>
        </div>
      </header>
      {pageAlerts}
      <p className="rp-sr-only" role="status" aria-live="polite">{announce}</p>
    </>
  );
  const boardMenu = (
    <div className="rp-wb-boardwrap" ref={boardRef}>
      {editing && !focus && (
        <PrimaryButton size="sm" className="rp-wb-donebtn" onClick={() => setEditing(false)}>Done editing</PrimaryButton>
      )}
      <button type="button" className="rp-wb-boardtoggle" aria-expanded={boardMenuOpen} aria-controls="wb-boardctl" onClick={() => setBoardMenuOpen(o => !o)}>
        Board: <b>{board.name}</b> <ChevronDown size={14} aria-hidden style={{ transform: boardMenuOpen ? "rotate(180deg)" : "none" }} />
      </button>
      <div className="rp-wb-boardctl" id="wb-boardctl" hidden={!boardMenuOpen} onKeyDown={e => { if (e.key === "Escape") { setBoardMenuOpen(false); (boardRef.current?.querySelector(".rp-wb-boardtoggle") as HTMLElement | null)?.focus(); } }}>
        <span className="rp-wb-boardpick">
          <label className="rp-wb-lbl" htmlFor="wb-layout">Board</label>
          <select id="wb-layout" className="rp-wb-select" value={board.id} onChange={e => {
            if (e.target.value === "__new") setNewBoardOpen(true);
            else commitStore(selectBoard(store, e.target.value));
          }}>
            {store.boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            {store.boards.length < MAX_BOARDS && <option value="__new">+ New board…</option>}
          </select>
          <ActionMenu label="Board actions" actions={[
            { label: "Rename this board…", onSelect: renameThisBoard },
            ...(store.boards.length < MAX_BOARDS ? [
              { label: "Copy this board", onSelect: () => commitStore(copyBoard(store)) },
              { label: "New board…", onSelect: () => setNewBoardOpen(true) },
            ] : []),
            { label: `Reset to the ${TEMPLATES.find(t => t.id === board.template)?.name} board…`, onSelect: resetThisBoard },
            ...(store.boards.length > 1 ? [{ label: "Delete this board…", tone: "danger" as const, onSelect: deleteThisBoard }] : []),
          ]} />
        </span>
        <span className="rp-wb-lbl">{widgetCount} widget{widgetCount === 1 ? "" : "s"} on this board</span>
        {!focus && (
          <button type="button" className="rp-wb-editbtn" aria-pressed={editing} onClick={() => { setEditing(e => !e); setBoardMenuOpen(false); }}>
            {editing ? "Done editing" : <><Pencil size={14} aria-hidden /> Edit board</>}
          </button>
        )}
        <button type="button" className="rp-wb-a" onClick={header.onExport} disabled={!header.exportReady}>Download these figures (CSV)</button>
        {viewSaved
          ? <span className="rp-wb-saved">✓ Opens on these dates · <button type="button" className="rp-wb-a" onClick={forgetView}>Forget</button></span>
          : <button type="button" className="rp-wb-a" onClick={saveView} title={`Open “${board.name}” on ${header.viewName} from now on`}>Always open this board on these dates</button>}
      </div>
    </div>
  );
  const figures = (actions: ReactNode) => (
    <div className="rp-wb-figures">
      {header.figures}
      <div className="rp-wb-meta">
        <span className="rp-wb-updated"><span className="rp-wb-dot" aria-hidden="true" />
          <span className="rp-wb-lbl" aria-live="polite">{header.updated}</span>
          <IconButton className="rp-wb-refresh" label={header.refreshing ? "Refreshing…" : "Refresh the figures"} onClick={header.onRefresh} disabled={header.refreshing}>
            <RefreshCw size={14} aria-hidden data-spin={header.refreshing || undefined} />
          </IconButton>
        </span>
        {actions}
      </div>
      {header.summary && <p className="rp-wb-hint">{header.summary}</p>}
    </div>
  );

  const settingsWidget = settingsFor ? findWidget(board, settingsFor)?.widget || null : null;
  const settingsNode = settingsWidget && (
    <WidgetSettingsDialog widget={settingsWidget} onClose={() => setSettingsFor(null)}
      onSave={(patch, config) => {
        commit(b => { const sized = updateWidget(b, settingsWidget.id, patch); return config ? setWidgetConfig(sized, settingsWidget.id, config) : sized; });
        setAnnounce(`Saved the settings of ${widgetTitle(settingsWidget)}`);
        setSettingsFor(null);
      }} />
  );

  // ── Full view: one widget at full size, then everything else on the same topic ──
  if (focus) {
    const fromBoard = focus.kind === "widget" ? findWidget(board, focus.id) : null;
    if (focus.kind === "widget" && !fromBoard) { setTimeout(() => setFocus(null)); return null; }
    const band: BandId = focus.kind === "band" ? focus.band : focus.kind === "widget" ? fromBoard!.band.id : widgetMeta(focus.type).band;
    const main: BoardWidget | null = focus.kind === "widget" ? fromBoard!.widget : focus.kind === "type" ? { ...makeWidget(focus.type), id: `explore-${focus.type}` } : null;
    const mainConfig = main && (focus.kind === "type" ? tempConfig[main.id] || main.config : main.config);
    const setMainConfig = (patch: WidgetConfig) => {
      if (!main) return;
      if (focus.kind === "widget") commit(b => setWidgetConfig(b, main.id, patch));
      else setTempConfig(c => ({ ...c, [main.id]: { ...(c[main.id] || main.config || {}), ...patch } }));
    };
    const others = WIDGETS.filter(m => m.band === band && m.type !== main?.type).map(m => {
      const onBoardCopy = board.bands.flatMap(b => b.widgets).find(w => w.type === m.type);
      return onBoardCopy || { ...makeWidget(m.type), id: `explore-${m.type}` };
    });
    const meta = bandMeta(band);
    return (
      <div className="rp-stack rp-ov rp-wb" data-density={board.density}>
        {head}
        {figures(<div className="rp-wb-toolbar-actions">{boardMenu}</div>)}
        <nav className="rp-wb-crumbs" aria-label="Where you are">
          <GhostButton size="sm" onClick={closeFocus}>← Back to “{board.name}”</GhostButton>
          <span aria-hidden="true">›</span>
          {main ? <button type="button" className="rp-wb-crumb" onClick={() => openFocus({ kind: "band", band })}>{meta.title}</button> : <span>{meta.title}</span>}
          {main && <><span aria-hidden="true">›</span><span aria-current="page">{widgetTitle(main)}</span></>}
          <span className="rp-hint rp-wb-esc">Esc goes back</span>
        </nav>
        {main && (
          <section className="rp-wb-full" aria-labelledby="wb-full-title">
            <div className="rp-wb-full-head">
              <div>
                <div className="rp-ov-eyebrow">{meta.title} · bigger view</div>
                <h2 id="wb-full-title" className="rp-wb-full-title" tabIndex={-1}>{widgetTitle(main)}</h2>
                <p className="rp-hint" style={{ margin: "4px 0 0" }}>{widgetMeta(main.type).blurb}</p>
              </div>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {focus.kind === "type" && (canAdd(board, main.type)
                  ? <PrimaryButton size="sm" onClick={() => add(main.type, mainConfig || undefined)}><Plus size={14} aria-hidden /> Add to board</PrimaryButton>
                  : <StatusBadge tone="success">On your board</StatusBadge>)}
                {focus.kind === "widget" && <SecondaryButton size="sm" onClick={() => setSettingsFor(main.id)}>Settings…</SecondaryButton>}
              </span>
            </div>
            <div className="rp-wb-full-body">
              <WidgetBoundary name={widgetTitle(main)}>
                <CardInWidget.Provider value={true}>{renderWidget({ ...main, ...(mainConfig ? { config: mainConfig } : {}) }, { full: true, setConfig: setMainConfig })}</CardInWidget.Provider>
              </WidgetBoundary>
            </div>
          </section>
        )}
        <section className="rp-wb-band" aria-labelledby="wb-more-title">
          <div className="rp-wb-band-head">
            <div style={{ minWidth: 0 }}>
              <h2 id="wb-more-title" className="rp-wb-band-title" tabIndex={-1}>{main ? `More about ${meta.title.toLowerCase()}` : `Everything about ${meta.title.toLowerCase()}`}</h2>
              <p className="rp-wb-band-blurb">{meta.blurb}. Widgets already on your board say so; add any other with one click.</p>
            </div>
          </div>
          <div className="rp-wb-grid">{others.map((w, i, a) => frame(w, { index: i, total: a.length, explore: true }))}</div>
        </section>
        {settingsNode}
        {confirmNode}{promptNode}
      </div>
    );
  }

  return (
    <div className="rp-stack rp-ov rp-wb" data-density={board.density} data-editing={editing || undefined}>
      {head}

      {/* Sub tabs: one per topic (Everything = the whole board), and a second row inside Visitors. */}
      <div className="rp-wb-tabsrow">
        <div className="rp-wb-tabs">
        <Tabs<TopTab> variant="page" label="Overview topics" idPrefix="overview-" value={tab.band} onChange={band => openTab({ band, sub: "all" })}
          tabs={topTabs(board, editing).map(id => ({ id, label: id === "all" ? "Everything" : bandMeta(id).title, ...(id === "all" ? {} : { count: board.bands.find(b => b.id === id)!.widgets.length }) }))} />
        </div>
      </div>
      {figures(
        <div className="rp-wb-toolbar-actions">
          {(past.length > 0 || future.length > 0) && (
            <span className="rp-wb-undo">
              <GhostButton size="sm" onClick={undo} disabled={!past.length} aria-keyshortcuts="Control+Z">↶ Undo</GhostButton>
              <GhostButton size="sm" onClick={redo} disabled={!future.length} aria-keyshortcuts="Control+Shift+Z">Redo</GhostButton>
            </span>
          )}
          <span className="rp-wb-save" role="status" aria-live="polite" data-state={saveState} data-quiet={saveState === "saved" || undefined} title={saveState === "error" ? saveError : saveState === "local" ? "Your account copy couldn't be reached; this browser keeps your board." : undefined}>
            {SAVE_WORDS[saveState]}
            {saveState === "error" && <button type="button" className="rp-wb-link" onClick={onRetrySave}>Try again</button>}
          </span>
          {boardMenu}
          <ActionMenu label="View options" actions={[
            board.density === "compact"
              ? { label: "Comfortable spacing", onSelect: () => commit(b => ({ ...b, density: "comfortable" })) }
              : { label: "Compact spacing", onSelect: () => commit(b => ({ ...b, density: "compact" })) },
            { label: allFolded ? "Unfold everything" : "Fold everything", onSelect: () => commit(b => collapseEverything(b, !allFolded)) },
          ]} />
          <PrimaryButton size="sm" className="rp-wb-addbtn" onClick={() => openTray("all")} data-new={unseenNew || undefined}>
            <Plus size={14} aria-hidden /> Add widgets{unseenNew && <span className="rp-wb-newdot" aria-label="(new widgets)" />}
          </PrimaryButton>
        </div>
      )}

      {/* While editing, one line says how to move widgets (the topic tabs above already jump between topics). */}
      {editing && <div className="rp-wb-toolbar" role="toolbar" aria-label="Board">
        <p className="rp-wb-edit-hint">
          Editing <strong>{board.name}</strong>: drag a widget by its grip or use ← → to move it within its topic, and pick its width on its bar. Undo is at the top.
        </p>
      </div>}

      {widgetCount === 0 && (
        <EmptyState icon="▦" title="This board is empty" description="Add the figures and lists you want to watch, or start from a ready-made board. Widgets sit under their own topic, so the board stays tidy."
          action={<span style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <PrimaryButton onClick={() => openTray("all")}>Add widgets</PrimaryButton>
            <SecondaryButton onClick={() => setNewBoardOpen(true)}>Start from a ready-made board</SecondaryButton>
          </span>} />
      )}

      {shownBands.map(band => {
        const bi = bands.indexOf(band);
        const meta = bandMeta(band.id);
        const folded = !!band.collapsed;
        const widgets = shownWidgets(band);
        const allWidgetsFolded = widgets.length > 0 && widgets.every(w => w.collapsed);
        const sizes = widgets.map(w => w.size);
        const fillD = editing ? [] : rowFills(sizes, SPAN_DESK);
        const fillT = editing ? [] : rowFills(sizes, SPAN_TABLET);
        const n = widgets.length;
        return (
          <section key={band.id} id={`wb-band-${band.id}`} className="rp-wb-band" data-band={band.id} data-folded={folded || undefined} aria-labelledby={`wb-band-title-${band.id}`}>
            <div className="rp-wb-band-head">
              <button type="button" className="rp-wb-fold" aria-expanded={!folded} aria-controls={`wb-band-body-${band.id}`} aria-label={`${folded ? "Unfold" : "Fold"} ${meta.title}`}
                onClick={() => commit(b => updateBand(b, band.id, { collapsed: !folded }))}>
                <ChevronRight size={20} aria-hidden style={{ transform: folded ? "none" : "rotate(90deg)" }} />
              </button>
              <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                <h2 id={`wb-band-title-${band.id}`} className="rp-wb-band-title">
                  <button type="button" aria-expanded={!folded} onClick={() => commit(b => updateBand(b, band.id, { collapsed: !folded }))}>{meta.title}</button>
                  <span className="rp-wb-band-count">{n} widget{n === 1 ? "" : "s"}</span>
                </h2>
                {!folded && <p className="rp-wb-band-blurb">{meta.blurb}</p>}
              </div>
              <span className="rp-wb-band-actions">
                {!folded && n > 1 && (
                  <GhostButton size="sm" onClick={() => commit(b => widgets.reduce((x, w) => updateWidget(x, w.id, { collapsed: !allWidgetsFolded }), b))}>{allWidgetsFolded ? "Unfold widgets" : "Fold widgets"}</GhostButton>
                )}
                <GhostButton size="sm" onClick={() => openFocus({ kind: "band", band: band.id })}>Explore all {WIDGETS.filter(w => w.band === band.id).length}</GhostButton>
                {editing && (
                  <>
                    <SecondaryButton size="sm" onClick={() => openTray(band.id)}><Plus size={14} aria-hidden /> Add</SecondaryButton>
                    <span className="rp-wb-band-edit">
                      <GhostButton size="sm" aria-label={`Move ${meta.title} up`} disabled={bi === 0} onClick={() => commit(b => moveBand(b, band.id, -1))}>↑ Up</GhostButton>
                      <GhostButton size="sm" aria-label={`Move ${meta.title} down`} disabled={bi === bands.length - 1} onClick={() => commit(b => moveBand(b, band.id, 1))}>↓ Down</GhostButton>
                      <GhostButton size="sm" onClick={() => commit(b => updateBand(b, band.id, { hidden: true }))}>Hide topic</GhostButton>
                    </span>
                    <span className="rp-wb-band-more">
                      <ActionMenu label={`More for ${meta.title}`} actions={[
                        ...(bi > 0 ? [{ label: "Move topic up", onSelect: () => commit(b => moveBand(b, band.id, -1)) }] : []),
                        ...(bi < bands.length - 1 ? [{ label: "Move topic down", onSelect: () => commit(b => moveBand(b, band.id, 1)) }] : []),
                        { label: "Hide topic", onSelect: () => commit(b => updateBand(b, band.id, { hidden: true })) },
                      ]} />
                    </span>
                  </>
                )}
              </span>
            </div>
            {!folded && (
              <div id={`wb-band-body-${band.id}`} className="rp-wb-grid">
                {widgets.map((w, i) => frame(w, { index: i, total: n, fill: [fillD[i] ?? null, fillT[i] ?? null] }))}
                {editing && (
                  <button type="button" className="rp-wb-dropzone" data-drop={drag && drag.over === `end-${band.id}` || undefined}
                    onDragOver={e => { const d = dragRef.current; if (!d || findWidget(board, d.id)?.band.id !== band.id) return; e.preventDefault(); if (d.over !== `end-${band.id}`) setDrag({ ...d, over: `end-${band.id}` }); }}
                    onDrop={e => { const d = dragRef.current; if (!d) return; e.preventDefault(); commit(b => moveWidgetTo(b, d.id, null)); setDrag(null); }}
                    onClick={() => openTray(band.id)}>
                    {drag ? "Drop here to put it last" : n === 0 ? `Nothing in ${meta.title} yet — add a widget` : `+ Add to ${meta.title}`}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Hidden topics stay findable outside edit mode too. */}
      {hiddenBands.length > 0 && (
        <p className="rp-wb-hidden">
          {hiddenBands.length} topic{hiddenBands.length === 1 ? "" : "s"} hidden —{" "}
          {hiddenBands.map((b, i) => (
            <Fragment key={b.id}>{i > 0 && " · "}<button type="button" className="rp-wb-link" onClick={() => commit(x => updateBand(x, b.id, { hidden: false }))}>Show {bandMeta(b.id).title}</button></Fragment>
          ))}
        </p>
      )}

      <AddWidgetTray open={tray.open} band={tray.band} board={board} onBand={band => setTray(t => ({ ...t, band }))}
        onClose={() => setTray(t => ({ ...t, open: false }))} onAdd={type => add(type, undefined, { fromTray: true })}
        onShow={showWidget}
        onPreview={type => { setTray(t => ({ ...t, open: false })); openFocus({ kind: "type", type }); }} />
      <NewBoardDialog open={newBoardOpen} onClose={() => setNewBoardOpen(false)} canCopy={store.boards.length < MAX_BOARDS}
        onCreate={(template, name) => { commitStore(template === "copy" ? copyBoard(store, name) : addBoard(store, template, name)); setNewBoardOpen(false); }} />
      {settingsNode}
      {confirmNode}{promptNode}
    </div>
  );
}

/** "Add widgets": new and suggested widgets first, then every widget by topic, with a forgiving search. */
function AddWidgetTray({ open, band, board, onBand, onClose, onAdd, onShow, onPreview }: {
  open: boolean; band: BandId | "all"; board: Board; onBand: (b: BandId | "all") => void; onClose: () => void;
  onAdd: (type: WidgetType) => string | null; onShow: (widgetId: string) => void; onPreview: (type: WidgetType) => void;
}) {
  const [query, setQuery] = useState("");
  // The widget just added: the tray stays open and offers to show it.
  const [added, setAdded] = useState<{ type: WidgetType; id: string } | null>(null);
  useEffect(() => { if (open) { setQuery(""); setAdded(null); } }, [open]);
  const doAdd = (type: WidgetType) => { const id = onAdd(type); if (id) setAdded({ type, id }); };
  const showType = (type: WidgetType) => { const w = board.bands.flatMap(b => b.widgets).find(x => x.type === type); if (w) onShow(w.id); };
  const q = query.trim();
  const hits = useMemo(() => searchWidgets(q).filter(m => band === "all" || m.band === band), [q, band]);
  // New and suggested widgets not on the board yet, fixed while the tray is open, so adding one doesn't pull the
  // list (and the button under the finger or keyboard focus) out from under the owner.
  const picks = useRef<{ fresh: WidgetMeta[]; suggested: WidgetMeta[] } | null>(null);
  if (!open) picks.current = null;
  else if (!picks.current) picks.current = {
    fresh: WIDGETS.filter(m => NEW_WIDGETS.includes(m.type) && countOf(board, m.type) === 0),
    suggested: SUGGESTED.map(t => widgetMeta(t)).filter(m => countOf(board, m.type) === 0).slice(0, 6),
  };
  const hiddenBand = (id: BandId) => !!board.bands.find(b => b.id === id)?.hidden;
  const groups: Array<{ key: string; title: string; widgets: WidgetMeta[] }> = [];
  if (q) { if (hits.length) groups.push({ key: "hits", title: `Best matches for “${q}”`, widgets: hits }); }
  else {
    if (band === "all" && picks.current) {
      const { fresh, suggested } = picks.current;
      if (fresh.length) groups.push({ key: "new", title: "New this week", widgets: fresh });
      if (suggested.length) groups.push({ key: "suggested", title: "Suggested for you", widgets: suggested });
    }
    BANDS.forEach(b => { const ws = hits.filter(m => m.band === b.id); if (ws.length) groups.push({ key: b.id, title: b.title, widgets: ws }); });
  }
  const total = hits.length;
  return (
    <Dialog open={open} onClose={onClose} variant="drawer" title="Add widgets" description={`${WIDGETS.length} widgets in ${BANDS.length} topics. Each joins its own topic on the board.`}
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <SearchField label="Find a widget" placeholder="Try “money”, “reprint”, “instagram”…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="rp-wb-chips" role="group" aria-label="Topic">
          <button type="button" aria-pressed={band === "all"} onClick={() => onBand("all")}>All</button>
          {BANDS.map(b => <button key={b.id} type="button" aria-pressed={band === b.id} onClick={() => onBand(b.id)}>{b.title}</button>)}
        </div>
        <p className="rp-hint" style={{ margin: 0 }}>{q ? `${total} widget${total === 1 ? "" : "s"} match` : `${total} widget${total === 1 ? "" : "s"}`}</p>
        <div role="status" aria-live="polite">
          {added && (
            <p className="rp-wb-added">
              <span><span aria-hidden="true">✓ </span>Added “{widgetMeta(added.type).title}” to {bandMeta(widgetMeta(added.type).band).title}.</span>
              <button type="button" className="rp-wb-a" onClick={() => onShow(added.id)}>Show it</button>
            </p>
          )}
        </div>
        {total === 0 && (
          <div className="rp-wb-nomatch">
            <p style={{ margin: 0 }}><b>No widget for “{q}”.</b> Try another word, or look through a topic:</p>
            <div className="rp-wb-chips">
              {band !== "all" && <button type="button" onClick={() => onBand("all")}>All topics</button>}
              {BANDS.map(b => <button key={b.id} type="button" onClick={() => { setQuery(""); onBand(b.id); }}>{b.title}</button>)}
            </div>
          </div>
        )}
        {groups.map(g => (
          <section key={g.key} aria-label={g.title}>
            <h3 className="rp-wb-tray-head">{g.title}</h3>
            <ul className="rp-wb-tray">
              {g.widgets.map(m => {
                const n = countOf(board, m.type);
                const can = canAdd(board, m.type);
                return (
                  <li key={m.type}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="rp-wb-tray-title">
                        {m.title}
                        {NEW_WIDGETS.includes(m.type) && <span className="rp-wb-newtag">New</span>}
                      </div>
                      <div className="rp-hint">{m.blurb}{g.key === "new" || g.key === "suggested" || g.key === "hits" ? ` · ${bandMeta(m.band).title}` : ""}</div>
                      <div className="rp-wb-tray-badges">
                        {n > 0 && <StatusBadge tone="success">On your board{n > 1 ? ` ×${n}` : ""}</StatusBadge>}
                        {m.multi && <StatusBadge tone="neutral">Add as many as you like</StatusBadge>}
                        {m.google && <StatusBadge tone="neutral">Needs Google Analytics set up</StatusBadge>}
                        {hiddenBand(m.band) && <StatusBadge tone="warning">Topic hidden — adding shows it</StatusBadge>}
                      </div>
                    </div>
                    <span className="rp-wb-tray-actions">
                      {can
                        ? <SecondaryButton size="sm" onClick={() => doAdd(m.type)} aria-label={`Add ${m.title}`}>Add</SecondaryButton>
                        : <SecondaryButton size="sm" onClick={() => showType(m.type)} aria-label={`Show ${m.title} on the board`}>Show it</SecondaryButton>}
                      <GhostButton size="sm" onClick={() => onPreview(m.type)} aria-label={`Preview ${m.title}`}>Preview</GhostButton>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** What each starter board is good for, in the owner's words. */
const TEMPLATE_GOOD_FOR: Partial<Record<TemplateId, string>> = {
  desk: "Good for the morning check: orders to ship, today's sales and what's running low",
  everything: "Good for looking around: every widget, then keep what you use",
  money: "Good for month end and pricing: revenue, average order, codes and payments",
  marketing: "Good for after a post or newsletter: visitors, where they came from and Google",
  stock: "Good for planning reprints: low stock, wanted books and slow sellers",
  launch: "Good for a new book's first week: sales by day, sources, checkout and stock",
};

function NewBoardDialog({ open, onClose, onCreate, canCopy }: {
  open: boolean; onClose: () => void; canCopy: boolean; onCreate: (template: TemplateId | "copy", name: string) => void;
}) {
  const [template, setTemplate] = useState<TemplateId | "copy">("desk");
  const [name, setName] = useState("");
  useEffect(() => { if (open) { setTemplate("desk"); setName(""); } }, [open]);
  const chosen = TEMPLATES.find(t => t.id === template);
  return (
    <Dialog open={open} onClose={onClose} title="New board" description="Boards are separate arrangements of the same figures — one for the morning, one for money, one for a launch."
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton disabled={!canCopy} onClick={() => onCreate(template, name.trim() || (template === "copy" ? "" : chosen?.name || "My board"))}>Create board</PrimaryButton></>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        {!canCopy && <p className="rp-hint" style={{ margin: 0 }}>You have the most boards there can be ({MAX_BOARDS}). Delete one first.</p>}
        <fieldset className="rp-wb-templates">
          <legend className="rp-label">Start from</legend>
          {TEMPLATES.map(t => (
            <label key={t.id}>
              <input type="radio" name="wb-template" checked={template === t.id} onChange={() => setTemplate(t.id)} />
              <span><strong>{t.name}</strong><span className="rp-hint" style={{ display: "block" }}>{TEMPLATE_GOOD_FOR[t.id] || t.blurb} · {t.widgets.length} widgets</span></span>
            </label>
          ))}
          <label>
            <input type="radio" name="wb-template" checked={template === "copy"} onChange={() => setTemplate("copy")} />
            <span><strong>A copy of the board on screen</strong><span className="rp-hint" style={{ display: "block" }}>Same widgets, sizes and settings, to change without touching the original</span></span>
          </label>
        </fieldset>
        <TextField label="Name" placeholder={template === "copy" ? "e.g. Launch of The Hound" : chosen?.name} value={name} maxLength={40} onChange={e => setName(e.target.value)} />
      </div>
    </Dialog>
  );
}

/** Reprint wait in days, as the Sold-out countdown reads it: a whole number from 1 to 365, else a message. */
export function leadDaysProblem(text: string): string {
  const n = Number(text.trim());
  return text.trim() && Number.isInteger(n) && n >= 1 && n <= 365 ? "" : "Type a number of days from 1 to 365.";
}
/** Month goal in CA$: a positive amount, else a message. Commas and a $ sign are allowed. */
export function goalProblem(text: string): string {
  const n = Number(text.replace(/[,$\s]|CA/gi, ""));
  return text.trim() === "" || (Number.isFinite(n) && n > 0) ? "" : "Type an amount in dollars, like 2,000.";
}

/**
 * Settings… for one widget: its width and height, plus whatever that widget lets you choose (chart, figures,
 * goal, reprint wait). Saved together as one change, so Undo takes it all back.
 */
function WidgetSettingsDialog({ widget, onClose, onSave }: {
  widget: BoardWidget; onClose: () => void; onSave: (patch: { size: WidgetSize; height: WidgetHeight }, config: WidgetConfig | null) => void;
}) {
  const cfg = widget.config || {};
  const [size, setSize] = useState<WidgetSize>(widget.size);
  const [height, setHeight] = useState<WidgetHeight>(widget.height);
  const [metric, setMetric] = useState<ChartMetric>((cfg.metric as ChartMetric) || "revenue");
  const [grain, setGrain] = useState<ChartGrain>(cfg.grain || "auto");
  const [compare, setCompare] = useState(cfg.compare !== false);
  const [figures, setFigures] = useState<FigureId[]>((cfg.figures || []) as FigureId[]);
  const [goal, setGoal] = useState(cfg.goal ? String(cfg.goal) : "");
  const [lead, setLead] = useState(String(cfg.leadDays ?? 35));
  const [tried, setTried] = useState(false);
  const t = widget.type;
  const leadError = t === "soldOut" ? leadDaysProblem(lead) : "";
  const goalError = t === "goal" ? goalProblem(goal) : "";
  const figError = t === "figures" && figures.length === 0 ? "Pick at least one figure." : "";
  const save = () => {
    setTried(true);
    if (leadError || goalError || figError) return;
    let config: WidgetConfig | null = null;
    if (t === "chart") config = { metric, grain, compare };
    if (t === "figures") config = { figures };
    if (t === "goal") { const n = Number(goal.replace(/[,$\s]|CA/gi, "")); config = goal.trim() ? { goal: Math.round(n) } : { goal: undefined }; }
    if (t === "soldOut") config = { leadDays: Number(lead) };
    onSave({ size, height }, config);
  };
  const toggleFig = (id: FigureId, on: boolean) => setFigures(p => (on ? FIGURES.map(f => f.id).filter(x => x === id || p.includes(x)) : p.filter(x => x !== id)));
  return (
    <Dialog open onClose={onClose} title={`Settings: ${widgetTitle(widget)}`} description={widgetMeta(t).blurb}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={save}>Save</PrimaryButton></>}>
      <form className="rp-stack" style={{ gap: 16 }} onSubmit={e => { e.preventDefault(); save(); }}>
        {t === "chart" && (
          <>
            <SelectField label="What the chart shows" value={metric} onChange={e => setMetric(e.target.value as ChartMetric)}>
              {CHART_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}{m.needsTraffic ? " (needs visit counts)" : ""}</option>)}
            </SelectField>
            <SelectField label="One point for" value={grain} onChange={e => setGrain(e.target.value as ChartGrain)}>
              {(Object.keys(GRAIN_WORDS) as ChartGrain[]).map(g => <option key={g} value={g}>{GRAIN_WORDS[g]}</option>)}
            </SelectField>
            <Checkbox label="Show the period before as a second line" checked={compare} onChange={e => setCompare(e.target.checked)} />
          </>
        )}
        {t === "figures" && (
          <fieldset className="rp-wb-templates" style={{ gap: 6 }}>
            <legend className="rp-label">Figures to show</legend>
            <div className="rp-wb-figpick">
              {FIGURES.map(f => <Checkbox key={f.id} label={f.label} checked={figures.includes(f.id)} onChange={e => toggleFig(f.id, e.target.checked)} />)}
            </div>
            {tried && figError && <p className="rp-error-text" role="alert" style={{ margin: 0 }}>{figError}</p>}
          </fieldset>
        )}
        {t === "goal" && (
          <TextField label="Monthly goal (CA$)" inputMode="decimal" placeholder="e.g. 2,000" value={goal} onChange={e => setGoal(e.target.value)}
            hint="Leave empty to set it later." error={tried ? goalError || undefined : undefined} />
        )}
        {t === "soldOut" && (
          <TextField label="A reprint takes (days)" inputMode="numeric" value={lead} onChange={e => setLead(e.target.value)}
            hint="Books that sell out sooner than this are flagged." error={tried ? leadError || undefined : undefined} />
        )}
        <fieldset className="rp-wb-templates">
          <legend className="rp-label">Width</legend>
          {SIZES.map(s => (
            <label key={s.id}>
              <input type="radio" name="wb-set-size" checked={size === s.id} onChange={() => setSize(s.id)} />
              <span><strong>{SIZE_WORDS[s.id].name}</strong> <span className="rp-hint">— {SIZE_WORDS[s.id].hint}</span></span>
            </label>
          ))}
        </fieldset>
        <fieldset className="rp-wb-templates">
          <legend className="rp-label">Height</legend>
          {HEIGHTS.map(h => (
            <label key={h.id}>
              <input type="radio" name="wb-set-height" checked={height === h.id} onChange={() => setHeight(h.id)} />
              <span><strong>{HEIGHT_WORDS[h.id].name}</strong> <span className="rp-hint">— {HEIGHT_WORDS[h.id].hint}</span></span>
            </label>
          ))}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
