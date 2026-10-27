import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, History, Minus, PackagePlus, Plus } from "lucide-react";
import { adminApi } from "./api";
import { getOrdersCached } from "./ordersCache";
import { inventoryApi, type InventoryLogEntry } from "./inventoryApi";
import { InventoryLinkPanel } from "./InventoryLinkPanel";
import { useSubTab } from "./settingsLayout";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { isStockLinked, type InventoryLinks } from "./inventoryLink";
import { smallPhotoUrl } from "../features/site/photoSources";
import {
  buildInventory, inventorySummary, inventoryToCsv, lowStockThreshold, parseCost, parseReceive, parseStock,
  waitingReaders, wakesRestockEmails, ADJUST_REASONS, STATUS_LABELS,
  type AdjustReason, type InventoryRow, type StockChange, type StockStatus,
} from "./inventoryInsights";
import {
  Checkbox, DataTable, Dialog, Drawer, EmptyState, ErrorState, FilterBar, GhostButton, IconButton, LoadingState, MetricCard,
  Pagination, PrimaryButton, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, TabPanel, Tabs,
  ToastProvider, useRisoToast, type BadgeTone, type Column,
} from "./riso/components";

const TONE: Record<StockStatus, BadgeTone> = {
  out: "danger", low: "warning", reprint: "info", ok: "success", digital: "neutral", untracked: "neutral", bundle: "primary", giftCard: "neutral",
};
/** Phone rows say a status as glyph + word, like the badges do. */
const GLYPH: Partial<Record<BadgeTone, string>> = { danger: "✕", warning: "⚠", success: "✓", info: "◷" };
const PAGE_SIZE = 25;
type Tab = "all" | "out" | "low" | "reprint" | "ok" | "digital" | "untracked" | "other";
const inTab = (r: InventoryRow, t: Tab) => t === "all" || (t === "other" ? r.status === "bundle" || r.status === "giftCard" : r.status === t);
const money = (n: number) => `CA$${n.toFixed(2)}`;

/** Non-destructive yes/no question (the Riso ConfirmDialog is styled for deleting). */
function useAsk() {
  const [state, setState] = useState<null | { title: string; message: string; confirmLabel: string; resolve: (v: boolean) => void }>(null);
  const ask = useCallback((o: { title: string; message: string; confirmLabel: string }) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  const node = (
    <Dialog open={!!state} onClose={() => done(false)} title={state?.title || ""}
      footer={<><SecondaryButton data-autofocus onClick={() => done(false)}>Cancel</SecondaryButton><PrimaryButton onClick={() => done(true)}>{state?.confirmLabel}</PrimaryButton></>}>
      <p className="rp-card-desc" style={{ margin: 0, fontSize: "var(--rp-text-base)" }}>{state?.message}</p>
    </Dialog>
  );
  return [ask, node] as const;
}

const rowName = (r: InventoryRow) => (r.edition ? `${r.title} (${r.edition})` : r.title);
const PHONE_MQ = "(max-width: 767px)";
/** A small cover for a phone row: the book's first photo (its smallest good copy), else its cover image. */
const rowCoverUrl = (r: InventoryRow): string => {
  const first = r.book?.photos?.[0];
  return (typeof first === "string" ? first : smallPhotoUrl(first, 80)) || (typeof r.book?.coverImage === "string" ? r.book.coverImage : "");
};

function InventoryPage({ onEditBook, onAddBook, subTab, onSubTabChange }: InventoryProps) {
  const toast = useRisoToast();
  const [ask, askNode] = useAsk();
  const [books, setBooks] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Parts of the page that fell back to defaults because they couldn't be read (low-stock line, cost prices, inventory app links).
  const [partial, setPartial] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  // Phones (concept A): the table becomes a sheet of rows with a − / count / + stepper.
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(PHONE_MQ).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_MQ);
    const on = () => setPhone(!!mq?.matches);
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, []);
  // Page sub tabs: the stock list, and the link to the inventory app.
  const [view, setView] = useSubTab<"inv-stock" | "inv-link">("inv-stock", subTab, onSubTabChange);
  const [q, setQ] = useState("");
  const [threshold, setThreshold] = useState(5);
  const [thresholdDraft, setThresholdDraft] = useState("5");
  const [showHidden, setShowHidden] = useState(false);
  const [reason, setReason] = useState<AdjustReason>("Count correction");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [receiving, setReceiving] = useState(false);
  const [receive, setReceive] = useState<Record<string, string>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryLogEntry[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  // Books matched to the inventory app are counted there (Inventory app link); their stock is read-only here.
  const [links, setLinks] = useState<InventoryLinks>({});
  // Rows (and the bulk save) already being saved: a fast second click must not apply the change twice.
  const inFlight = useRef<Set<string>>(new Set());
  const bulkInFlight = useRef(false);
  const linked = (r: InventoryRow) => r.kind === "stock" && isStockLinked(links, r.bookId, r.variantId);

  const load = async () => {
    setFailed(false); setLoading(true);
    const missed: string[] = [];
    const orEmpty = (label: string) => (e: unknown) => { console.error(e); missed.push(label); return {} as any; };
    try {
      const [b, o, s, c, l] = await Promise.all([
        adminApi.getAllBooks(), getOrdersCached(),
        inventoryApi.lowStockSetting().catch(orEmpty("the saved low-stock line")), inventoryApi.costs().catch(orEmpty("cost prices")),
        inventoryLinkApi.links().catch(orEmpty("which books the inventory app counts")),
      ]);
      setPartial(missed);
      setBooks(b); setLinks(l); setOrders(o.filter((x: any) => x.paymentStatus === "paid" && x.isTest !== true));
      setSettings(s); setCosts(c);
      const t = lowStockThreshold(s); setThreshold(t); setThresholdDraft(String(t));
    } catch (e) { console.error(e); setFailed(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // After the inventory app link changes stock: re-read the books only, keeping the page (and the link panel) as it is.
  const refreshBooks = async () => {
    try { setBooks(await adminApi.getAllBooks()); }
    catch (e) { console.error(e); toast("Stock changed, but the list couldn't be refreshed. Reload the page to see the new counts.", { tone: "warn" }); }
  };

  const everything = useMemo(() => buildInventory(books, orders, threshold), [books, orders, threshold]);
  const all = useMemo(() => everything.filter((r) => showHidden || (!r.archived && !r.draft)), [everything, showHidden]);
  const hiddenCount = everything.length - everything.filter((r) => !r.archived && !r.draft).length;
  const sum = useMemo(() => inventorySummary(all, costs), [all, costs]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: all.length, out: 0, low: 0, reprint: 0, ok: 0, digital: 0, untracked: 0, other: 0 };
    all.forEach((r) => (["out", "low", "reprint", "ok", "digital", "untracked", "other"] as Tab[]).forEach((t) => { if (inTab(r, t)) c[t]++; }));
    return c;
  }, [all]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const order = (r: InventoryRow) => (r.editable ? 0 : 1);
    return all.filter((r) => inTab(r, tab) && (!s || `${r.title} ${r.edition} ${r.shelfLocation}`.toLowerCase().includes(s)))
      .sort((a, b) => order(a) - order(b) || a.stock - b.stock || a.title.localeCompare(b.title));
  }, [all, tab, q]);
  useEffect(() => setPage(1), [tab, q, threshold, showHidden]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = receiving ? rows : rows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  const clearDraft = (id: string) => setDrafts((d) => { const { [id]: _, ...rest } = d; return rest; });
  const applyLocal = (r: InventoryRow, to: number) => setBooks((bs) => bs.map((b) => {
    if (b.id !== r.bookId) return b;
    if (!r.variantId) return { ...b, stockLevel: to };
    return { ...b, variants: (b.variants || []).map((v: any) => (v?.id === r.variantId ? { ...v, stock: to, stockLevel: to } : v)) };
  }));

  /** Readers who will be emailed if this row goes 0 → >0; asks first. false = the owner cancelled. */
  const confirmRestockEmails = async (items: Array<{ row: InventoryRow; from: number; to: number }>) => {
    const waking = items.filter((i) => wakesRestockEmails(i.row.book, i.from, i.to));
    if (!waking.length) return true;
    let readers = 0;
    try {
      for (const bookId of [...new Set(waking.map((w) => w.row.bookId))]) {
        const alerts = await inventoryApi.stockAlerts(bookId);
        waking.filter((w) => w.row.bookId === bookId).forEach((w) => { readers += waitingReaders(alerts, w.row.variantId); });
      }
    } catch { return ask({ title: "Back in stock", confirmLabel: "Save anyway", message: "Readers who asked to hear when this is back in stock may be emailed. Their sign-ups couldn't be checked just now." }); }
    if (!readers) return true;
    return ask({
      title: "Readers will be emailed", confirmLabel: "Save and email them",
      message: `${readers} reader${readers === 1 ? " is" : "s are"} waiting for ${waking.length === 1 ? rowName(waking[0].row) : "these books"} and will be emailed that ${waking.length === 1 ? "it's" : "they're"} back in stock.`,
    });
  };

  /** One change through the safe path. Returns the change made, or null. */
  const change = async (r: InventoryRow, ch: StockChange, why: AdjustReason, opts: { quiet?: boolean } = {}): Promise<{ from: number; to: number } | null> => {
    if (inFlight.current.has(r.id)) return null;
    inFlight.current.add(r.id);
    setSaving((s) => new Set(s).add(r.id));
    let confirmed = false;
    try {
      const preview = ch.kind === "delta" ? Math.max(0, r.stock + ch.delta) : ch.to;
      if (!(await confirmRestockEmails([{ row: r, from: r.stock, to: preview }]))) return null;
      confirmed = true;
      const meta = { reason: why, title: r.title, edition: r.edition };
      let res = await inventoryApi.adjustStock(r.bookId, r.variantId, ch, meta);
      if (!res.ok && res.reason === "conflict" && ch.kind === "set") {
        const go = await ask({
          title: "Stock changed since you opened the page", confirmLabel: `Set to ${ch.to}`,
          message: `This changed to ${res.live} since you opened the page (a sale?) — set it to ${ch.to} anyway?`,
        });
        if (!go) { applyLocal(r, res.live ?? r.stock); return null; }
        res = await inventoryApi.adjustStock(r.bookId, r.variantId, ch, { ...meta, force: true });
      }
      if (!res.ok) {
        toast(res.reason === "missing" ? `${rowName(r)} no longer exists. Reload the page.`
          : res.reason === "linked" ? `${rowName(r)} is counted in the inventory app. Change it there; the website follows.`
          : `${rowName(r)} isn't counted, so its stock can't be changed here.`, { tone: "err" });
        return null;
      }
      applyLocal(r, res.to);
      if (!opts.quiet && res.from !== res.to) {
        toast(`${rowName(r)}: ${res.from} → ${res.to}`, {
          actionLabel: "Undo",
          onAction: () => { void undo(r, res as any); },
        });
      }
      return { from: res.from, to: res.to };
    } catch (e) { console.error(e); toast(`Could not update ${rowName(r)}`, { tone: "err" }); return null; }
    finally {
      inFlight.current.delete(r.id);
      setSaving((s) => { const n = new Set(s); n.delete(r.id); return n; });
      if (confirmed) clearDraft(r.id);
    }
  };

  // − / +: with a typed count still in the box, step from that number (one change), else from the saved count.
  const step = (r: InventoryRow, delta: 1 | -1) => {
    const raw = drafts[r.id];
    const typed = raw === undefined ? null : parseStock(raw);
    if (typed !== null) return change(r, { kind: "set", to: Math.max(0, typed + delta), expected: r.stock }, reason);
    return change(r, { kind: "delta", delta }, reason);
  };

  // Undo puts back the difference (not the old absolute number), so a sale since is kept.
  const undo = async (r: InventoryRow, done: { from: number; to: number }) => {
    const res = await inventoryApi.adjustStock(r.bookId, r.variantId, { kind: "delta", delta: done.from - done.to }, { reason: "Undo", title: r.title, edition: r.edition })
      .catch(() => null);
    if (res?.ok) { applyLocal(r, res.to); toast(`${rowName(r)} back to ${res.to}`); } else toast(`Could not undo ${rowName(r)}`, { tone: "err" });
  };

  const commit = (r: InventoryRow) => {
    const raw = drafts[r.id];
    if (raw === undefined) return;
    const n = parseStock(raw);
    if (n === null) { toast("Enter a whole number", { tone: "err" }); clearDraft(r.id); return; }
    if (n === r.stock) { clearDraft(r.id); return; }
    void change(r, { kind: "set", to: n, expected: r.stock }, reason);
  };

  const saveThreshold = async () => {
    const n = parseStock(thresholdDraft);
    if (n === null) { setThresholdDraft(String(threshold)); return; }
    setThreshold(n); setThresholdDraft(String(n));
    if (n === lowStockThreshold(settings)) return;
    try { await inventoryApi.setLowStockThreshold(n); setSettings((s: any) => ({ ...s, inventory: { ...(s.inventory || {}), lowStockThreshold: n } })); toast(`Low-stock line saved: ${n}`); }
    catch { toast("Could not save the low-stock line", { tone: "err" }); }
  };

  const openHistory = async (r: InventoryRow) => {
    setHistoryFor(r); setHistory(null); setHistoryError(false);
    try { setHistory(await inventoryApi.history(r.bookId)); } catch { setHistoryError(true); }
  };

  const pendingReceive = rows.filter((r) => r.editable && !linked(r) && receive[r.id]?.trim());
  const pendingCosts = Object.entries(costDrafts).filter(([id, v]) => parseCost(v) !== undefined && (parseCost(v) ?? 0) !== (costs[id] ?? 0));
  const saveReceiving = async () => {
    const plans = pendingReceive.map((r) => ({ r, ch: parseReceive(receive[r.id]) }));
    const bad = plans.filter((p) => !p.ch);
    if (bad.length) { toast(`Check ${bad.length} entr${bad.length === 1 ? "y" : "ies"}: type +12, -3 or =40`, { tone: "err" }); return; }
    const badCost = Object.values(costDrafts).filter((v) => parseCost(v) === undefined).length;
    if (badCost) { toast("A cost price isn't a number", { tone: "err" }); return; }
    const items = plans.map(({ r, ch }) => {
      const c = ch!.kind === "set" ? { ...ch!, expected: r.stock } : ch!;
      return { row: r, ch: c, from: r.stock, to: c.kind === "delta" ? Math.max(0, r.stock + c.delta) : c.to };
    });
    if (bulkInFlight.current) return;
    bulkInFlight.current = true;
    setBulkSaving(true);
    try {
      if (!(await confirmRestockEmails(items))) return;
      const out: Record<string, { ok: boolean; text: string }> = {};
      const settled = await Promise.allSettled(items.map(async ({ row, ch }) => {
        const res = await inventoryApi.adjustStock(row.bookId, row.variantId, ch, { reason, title: row.title, edition: row.edition });
        if (res.ok) { applyLocal(row, res.to); out[row.id] = { ok: true, text: `${res.from} → ${res.to}` }; }
        else out[row.id] = { ok: false, text: res.reason === "conflict" ? `Changed to ${res.live} meanwhile — not saved` : "Not saved" };
        return res;
      }));
      settled.forEach((s, i) => { if (s.status === "rejected") out[items[i].row.id] = { ok: false, text: "Could not save — try again" }; });
      const costResults = await Promise.allSettled(pendingCosts.map(([id, v]) => inventoryApi.setCost(id, parseCost(v) as number | null).then(() => [id, parseCost(v)] as const)));
      const nextCosts = { ...costs };
      costResults.forEach((c) => { if (c.status === "fulfilled") { const [id, v] = c.value; if (v) nextCosts[id] = v; else delete nextCosts[id]; } });
      setCosts(nextCosts);
      const failedCosts = costResults.filter((c) => c.status === "rejected").length;
      setResults(out);
      setReceive((d) => Object.fromEntries(Object.entries(d).filter(([id]) => out[id] && !out[id].ok)));
      setCostDrafts({});
      const okCount = Object.values(out).filter((x) => x.ok).length;
      const failCount = Object.values(out).length - okCount;
      toast(`${okCount} saved${failCount ? `, ${failCount} not saved (still filled in)` : ""}${failedCosts ? `, ${failedCosts} cost price(s) not saved` : ""}`, { tone: failCount || failedCosts ? "warn" : "ok" });
    } finally { bulkInFlight.current = false; setBulkSaving(false); }
  };

  const exportCsv = () => {
    if (!rows.length) return toast("Nothing to export", { tone: "err" });
    const url = URL.createObjectURL(new Blob([inventoryToCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const firstRowOfBook = new Set<string>();
  const seen = new Set<string>();
  rows.forEach((r) => { if (!seen.has(r.bookId)) { seen.add(r.bookId); firstRowOfBook.add(r.id); } });

  const stockCell = (r: InventoryRow) => {
    if (r.kind === "bundle") return <span className="rp-hint">Box set: {r.bundleSets === null ? "unlimited" : r.bundleSets} available from parts</span>;
    if (r.kind === "giftCard") return <span className="rp-hint">Gift card — no stock</span>;
    if (r.kind === "digital") return <span className="rp-hint">Digital</span>;
    if (r.kind === "untracked") return <span className="rp-hint">Not tracked</span>;
    if (linked(r)) return (
      <div>
        <span className="rp-mono" aria-label={`Stock for ${rowName(r)}: ${r.stock}`}>{r.stock}</span>
        <div className="rp-hint">Counted in the inventory app</div>
      </div>
    );
    const busy = saving.has(r.id) || bulkSaving;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconButton label={`Decrease stock of ${rowName(r)}`} disabled={busy || r.stock <= 0} onMouseDown={(e) => e.preventDefault()} onClick={() => step(r, -1)}><Minus size={14} aria-hidden /></IconButton>
        <input className="rp-input rp-mono" style={{ width: 72, textAlign: "right" }} inputMode="numeric" aria-label={`Stock for ${rowName(r)}`}
          value={drafts[r.id] ?? String(r.stock)} disabled={busy}
          onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
          onBlur={() => commit(r)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") clearDraft(r.id); }} />
        <IconButton label={`Increase stock of ${rowName(r)}`} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => step(r, 1)}><Plus size={14} aria-hidden /></IconButton>
      </div>
    );
  };

  const columns: Column<InventoryRow>[] = [
    { key: "title", header: "Title", lead: true, render: (r) => (
      <div style={{ overflowWrap: "anywhere", minWidth: 150 }}>
        {onEditBook
          ? <button type="button" className="rp-row-link"
              onClick={() => onEditBook(r.book)} aria-label={`Edit ${r.title} in Books`}>{r.title}</button>
          : <div className="rp-row-link" style={{ cursor: "default", textDecoration: "none" }}>{r.title}</div>}
        <div className="rp-hint">
          {[r.edition, r.format].filter(Boolean).join(" · ") || "—"}
          {r.shelfLocation && <> · Shelf <span className="rp-mono">{r.shelfLocation}</span></>}
          {r.archived && " · Archived"}{r.draft && " · Draft"}{r.backorder && r.editable && " · Backorders on"}
        </div>
      </div>
    ) },
    { key: "stock", header: "On hand", render: stockCell },
    { key: "status", header: "Status", render: (r) => <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={TONE[r.status]}>{STATUS_LABELS[r.status]}</StatusBadge></span> },
    ...(receiving ? [
      { key: "receive", header: "Receive", render: (r: InventoryRow) => linked(r) ? <span className="rp-hint">Receive it in the inventory app</span> : r.editable ? (
        <div>
          <input className="rp-input rp-mono" style={{ width: 84 }} placeholder="+12" aria-label={`Copies received for ${rowName(r)} (+12 adds, -3 removes, =40 sets)`}
            value={receive[r.id] ?? ""} disabled={bulkSaving} onChange={(e) => setReceive((d) => ({ ...d, [r.id]: e.target.value }))} />
          {results[r.id] && <div className="rp-hint" role="status" style={{ color: results[r.id].ok ? "var(--rp-success)" : "var(--rp-danger)" }}>{results[r.id].ok ? "✓ " : "✕ "}{results[r.id].text}</div>}
        </div>) : "—" } as Column<InventoryRow>,
      { key: "cost", header: "Cost / copy (CA$)", render: (r: InventoryRow) => firstRowOfBook.has(r.id) && r.kind !== "giftCard" ? (
        <input className="rp-input rp-mono" style={{ width: 84 }} inputMode="decimal" aria-label={`Cost price per copy for ${r.title}`}
          value={costDrafts[r.bookId] ?? (costs[r.bookId] ? String(costs[r.bookId]) : "")} disabled={bulkSaving}
          onChange={(e) => setCostDrafts((d) => ({ ...d, [r.bookId]: e.target.value }))} />) : "" } as Column<InventoryRow>,
    ] : [
      { key: "sold", header: "Sold (30d)", numeric: true, render: (r: InventoryRow) => r.sold30 } as Column<InventoryRow>,
      { key: "cover", header: "Days of cover", numeric: true, render: (r: InventoryRow) => r.coverDays ?? "—" } as Column<InventoryRow>,
      { key: "value", header: "Stock value", numeric: true, render: (r: InventoryRow) => r.kind === "stock" ? (
        <div>{money(r.value)}{costs[r.bookId] ? <div className="rp-hint">{money(r.stock * costs[r.bookId])} at cost</div> : null}</div>) : "—" } as Column<InventoryRow>,
      { key: "history", header: "History", render: (r: InventoryRow) => (
        <IconButton label={`Stock history for ${r.title}`} onClick={() => openHistory(r)}><History size={16} aria-hidden /></IconButton>) } as Column<InventoryRow>,
    ]),
  ];

  const emptyList = <EmptyState title="No titles match" description={q.trim() ? `Nothing in this tab matches “${q.trim()}”.` : "Nothing is in this tab right now."}
    action={tab !== "all" || q.trim() ? <SecondaryButton onClick={() => { setTab("all"); setQ(""); }}>Show every title</SecondaryButton> : undefined} />;
  const phoneSheet = pageRows.length === 0 ? emptyList : (
    <ul className="inv-sheet" aria-label="Inventory">
      {pageRows.map((r) => {
        const cover = rowCoverUrl(r);
        const meta = [r.edition || r.format, r.shelfLocation ? `Shelf ${r.shelfLocation}` : "", r.draft ? "Draft" : "", r.archived ? "Archived" : ""].filter(Boolean).join(" · ");
        const counted = r.kind === "stock";
        return (
          <li key={r.id} className="inv-sheet-row">
            <span className="inv-sheet-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}</span>
            <span className="inv-sheet-body">
              {onEditBook
                ? <button type="button" className="inv-sheet-title" onClick={() => onEditBook(r.book)} aria-label={`Edit ${r.title} in Books`}>{r.title}</button>
                : <span className="inv-sheet-title">{r.title}</span>}
              <span className="inv-sheet-meta"><span className="inv-sheet-status" data-tone={TONE[r.status]}>{GLYPH[TONE[r.status]] ? <span aria-hidden="true">{GLYPH[TONE[r.status]]} </span> : null}{STATUS_LABELS[r.status]}</span>{meta ? <span className="rp-mono">· {meta}</span> : null}</span>
              {counted && linked(r) ? <span className="inv-sheet-note">Synced from the app</span> : null}
            </span>
            <span className="inv-sheet-stock">{counted && !linked(r) ? stockCell(r) : counted ? <span className="rp-mono inv-sheet-count" aria-label={`Stock for ${rowName(r)}: ${r.stock}`}>{r.stock}</span> : null}</span>
          </li>
        );
      })}
    </ul>
  );

  if (loading) return <LoadingState label="Loading inventory…" />;
  if (failed) return <ErrorState title="Inventory could not be loaded" onRetry={load} />;

  return (
    <div className="rp-stack">
      {partial.length > 0 && (
        <div className="rp-card" role="status" style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", borderColor: "var(--rp-warning)" }}>
          <span style={{ flex: 1, minWidth: 220 }}>Couldn't load {partial.join(", ")}. The page is using defaults for {partial.length === 1 ? "it" : "them"} until it loads.</span>
          <SecondaryButton size="sm" onClick={load}>Retry</SecondaryButton>
        </div>
      )}
      <Tabs variant="page" label="Inventory" value={view} onChange={setView} tabs={[
        { id: "inv-stock", label: "Stock" },
        { id: "inv-link", label: "Inventory app link" },
      ]} />
      <TabPanel tabId="inv-stock" active={view === "inv-stock"}>
      <div className="rp-stack">
      <div className="rp-kpi-grid inv-figures">
        <MetricCard label="Units on hand" value={sum.units} footer="Counted print editions" />
        <MetricCard label="Stock value" value={`CA$${sum.value.toFixed(0)}`}
          footer={sum.costedRows ? `At retail · CA$${sum.costValue.toFixed(0)} at cost (${sum.costedRows} of ${sum.countedRows} costed)` : "At retail price"} />
        <MetricCard label="Out of stock" value={sum.out} tone={sum.out ? "danger" : undefined} footer="Cannot be bought" />
        <MetricCard label="Low / reprint soon" value={sum.low + sum.reprint} tone={sum.low + sum.reprint ? "warn" : undefined} footer={`${sum.low} low · ${sum.reprint} selling fast`} />
      </div>
      <div className="inv-status"><Tabs<Tab> label="Stock status" value={tab} onChange={setTab}
        tabs={[
          { id: "all", label: "All", count: counts.all }, { id: "out", label: "Out of stock", count: counts.out },
          { id: "low", label: "Low stock", count: counts.low }, { id: "reprint", label: "Reprint soon", count: counts.reprint },
          { id: "ok", label: "In stock", count: counts.ok }, { id: "digital", label: "Digital", count: counts.digital },
          { id: "untracked", label: "Not tracked", count: counts.untracked }, { id: "other", label: "Box sets & gift cards", count: counts.other },
        ]} /></div>
      <div className="rp-hint inv-threshold" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: 0 }}>
        <label htmlFor="inv-low-stock-line">Show “Low stock” at or below</label>
        <input id="inv-low-stock-line" className="rp-input rp-mono" type="number" min={0} inputMode="numeric" style={{ width: 72, textAlign: "right" }}
          value={thresholdDraft} aria-describedby="inv-low-stock-help"
          onChange={(e) => setThresholdDraft(e.target.value)} onBlur={saveThreshold} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span id="inv-low-stock-help">copies. Saved for the whole shop.</span>
      </div>
      <FilterBar>
        <div className="rp-grow"><SearchField label="Search titles" placeholder="Search titles or shelf…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Checkbox label={`Show drafts & archived (${hiddenCount})`} checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        <SecondaryButton className="inv-export" icon={<Download size={16} aria-hidden />} onClick={exportCsv}>Export CSV</SecondaryButton>
      </FilterBar>
      <div className="inv-list">
      <SectionCard flush collapsible={false} title={receiving ? "Receive stock" : "Inventory"}
        description={receiving
          ? "+12 adds, -3 removes, =40 sets. Then Save all."
          : "Type a count and press Enter, or use − / +. Sales count themselves."}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <SelectField label="Reason for changes" value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)}>
              {ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </SelectField>
            {receiving ? (
              <>
                <GhostButton disabled={bulkSaving} onClick={() => { setReceiving(false); setReceive({}); setCostDrafts({}); setResults({}); }}>Leave receive mode</GhostButton>
                <PrimaryButton disabled={bulkSaving || (!pendingReceive.length && !pendingCosts.length)} onClick={saveReceiving}>
                  {bulkSaving ? "Saving…" : `Save all (${pendingReceive.length + pendingCosts.length})`}</PrimaryButton>
              </>
            ) : <PrimaryButton icon={<PackagePlus size={16} aria-hidden />} onClick={() => { setReceiving(true); setResults({}); }}>Receive stock</PrimaryButton>}
          </div>
        }>
        {phone && !receiving ? phoneSheet : <DataTable caption="Inventory" columns={columns} rows={pageRows} rowKey={(r) => r.id} empty={emptyList} />}
        {!receiving && rows.length > PAGE_SIZE && <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onPage={setPage} />}
      </SectionCard>
      </div>
      </div>
      </TabPanel>
      <TabPanel tabId="inv-link" active={view === "inv-link"}>
        <div className="rp-stack">
          <InventoryLinkPanel books={books} onLinksChanged={setLinks} onStockChanged={refreshBooks} onAddBook={onAddBook} />
        </div>
      </TabPanel>

      <Drawer open={!!historyFor} onClose={() => setHistoryFor(null)} title={historyFor ? `Stock history · ${historyFor.title}` : "Stock history"}
        description="Every count change made on this page or by the inventory app link, newest first. Sales and refunds change stock automatically and are listed on their orders.">
        {historyError ? <ErrorState description="History could not be loaded." onRetry={() => historyFor && openHistory(historyFor)} />
          : !history ? <LoadingState label="Loading history…" />
          : !history.length ? <EmptyState title="No changes recorded yet" description="Changes made from now on appear here." />
          : (
            <ul className="rp-list" aria-label="Stock changes">
              {history.map((h) => (
                <li key={h.id}>
                  <div style={{ fontWeight: 600 }}>{h.edition ? `${h.edition}: ` : ""}{h.from} → {h.to} <span className="rp-mono">({h.delta > 0 ? "+" : ""}{h.delta})</span></div>
                  <div className="rp-hint">{h.reason}{h.note ? ` — ${h.note}` : ""} · {new Date(h.at).toLocaleString()}{h.by ? ` · ${h.by}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
      </Drawer>
      {askNode}
    </div>
  );
}

type InventoryProps = {
  onEditBook?: (book: any) => void;
  /** "Add to the shop": open a new book with these values; `onCreated` gets its id after the first save. */
  onAddBook?: (prefill: Record<string, any>, onCreated: (id: string) => void) => void;
  /** The open sub tab when the Dashboard keeps it in the address bar (`#inventory/link`). */
  subTab?: string;
  onSubTabChange?: (id: string | undefined) => void;
};

export function Inventory(props: InventoryProps = {}) {
  return <ToastProvider><InventoryPage {...props} /></ToastProvider>;
}
