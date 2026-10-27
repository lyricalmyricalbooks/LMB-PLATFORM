import { CatalogReviewDialog } from "./CatalogReviewDialog";
import { catalogPublishIssues } from "./catalogPublishReview";
import { useState, useEffect, useMemo } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, SlidersHorizontal, Upload, X } from "lucide-react";
import "./books.css";
import { EditionStockDialog } from "./EditionStockDialog";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { type InventoryLinks } from "./inventoryLink";
import { compareShopOrder, moveId, shopOrderWrites } from "../features/site/shopOrder";
import { BookImportDialog } from "./BookImportDialog";
import { MerchantFeedDialog } from "./MerchantFeedDialog";
import { GoogleIndexDialog } from "./GoogleIndexDialog";
import { catalogToCsv, inventoryCsv, planPriceChange, type PriceMode } from "./bulkPricing";
import { adminApi } from "./api";
import { inventoryApi } from "./inventoryApi";
import { liveStockOf } from "./inventoryInsights";
import toast from "react-hot-toast";
import {
  ActionMenu, Checkbox, ConfirmDialog, DataTable, Dialog, DestructiveButton, GhostButton, TextField, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, Pagination,
  PrimaryButton, Tabs, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, type Column,
} from "./riso/components";
import { preorderActive, releaseDateOf } from "../features/site/preorder";
import { normalizeCategories } from "../features/site/navItems";
import {
  STATUS_FILTERS, STOCK_FILTERS, bookAuthor, bookReferences, inlineEditable, matchesStatus, matchesStock, priceInfo, publicationBadge, stockInfo,
} from "./catalogList";

interface BookCatalogProps {
  onEdit: (book: any) => void;
  onAdd: () => void;
  refreshTrigger?: number;
}

type SortKey = "shop" | "newest" | "oldest" | "title" | "price-asc" | "price-desc" | "stock-asc" | "stock-desc";
type BulkOp = "category-add" | "category-remove" | "shipping" | "track-on" | "track-off" | "backorder-on" | "backorder-off" | "archive";
const PAGE_SIZE = 25;

const slugOf = (b: any) => b.slug || (b.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Sub-path safe public URL (the site is served under /LyricalmyricalWebsite/ on GitHub Pages). */
const listingUrl = (b: any) =>
  `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/books/${slugOf(b)}`;

/** Runs one write per book; names the books that failed (they stay selected for a retry). */
async function eachBook(books: any[], write: (b: any) => Promise<unknown>) {
  const results = await Promise.allSettled(books.map(write));
  return books.filter((_, i) => results[i].status === "rejected");
}

const STATUS_CHIPS = [...STATUS_FILTERS, "Pre-order", "Coming soon"] as const;

export function BookCatalog({ onEdit, onAdd, refreshTrigger }: BookCatalogProps) {
  const [books, setBooks] = useState<any[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [formatFilter, setFormatFilter] = useState("All");
  const [sort, setSort] = useState<SortKey>("shop");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<"publish" | "draft" | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceMode, setPriceMode] = useState<PriceMode>("percent");
  const [priceValue, setPriceValue] = useState("10");
  const [includeEditions, setIncludeEditions] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "filtered" | "selected">("filtered");
  const [exportKind, setExportKind] = useState<"full" | "inventory">("full");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkOp, setBulkOp] = useState<BulkOp>("category-add");
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [shopCategories, setShopCategories] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [inline, setInline] = useState<{ id: string; field: "retailPrice" | "stockLevel"; value: string } | null>(null);
  // Books matched to the inventory app are counted there: no quick stock edit (Inventory › Inventory app link).
  const [stockLinks, setStockLinks] = useState<InventoryLinks>({});
  useEffect(() => { inventoryLinkApi.links().then(setStockLinks).catch(() => setStockLinks({})); }, []);
  const [stockEditId, setStockEditId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "bulk"; } | { kind: "one"; book: any }>(null);
  // Phones: the four filter drop-downs and the sort fold behind one "Filters & sort" button.
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => { loadBooks(); }, [refreshTrigger]);
  useEffect(() => {
    adminApi.getAuthors().then((list: any[]) => setAuthors(Object.fromEntries(list.map(a => [a.id, a.name || ""])))).catch(() => {});
  }, []);

  async function loadBooks() {
    setFailed(false);
    try {
      setBooks(await adminApi.getAllBooks());
    } catch (err) {
      console.error(err);
      setFailed(true);
      toast.error("Failed to load books");
    } finally {
      setLoading(false);
    }
  }

  const byId = useMemo(() => new Map(books.map(b => [b.id, b])), [books]);
  const stockOf = useMemo(() => { const cache = new Map<any, ReturnType<typeof stockInfo>>(); return (b: any) => { let s = cache.get(b); if (!s) { s = stockInfo(b, id => byId.get(id)); cache.set(b, s); } return s; }; }, [byId]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    books.forEach(b => (b.categories || b.genres || []).forEach((c: string) => c && cats.add(c.trim())));
    return ["All", ...Array.from(cats)];
  }, [books]);
  const formats = useMemo(() => ["All", ...Array.from(new Set(books.map(b => b.format).filter(Boolean)))], [books]);

  const haystackCache = useMemo(() => new WeakMap<any, string>(), [authors]);
  const q = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const list = books.filter(b => {
      if (stockFilter === "Needs review") { if (!catalogPublishIssues(b).length) return false; }
      else if (!matchesStock(stockOf(b), stockFilter)) return false;
      if (q) {
        let h = haystackCache.get(b);
        if (!h) { h = [b.title, b.isbn, b.sku, bookAuthor(b, authors)].join(" ").toLowerCase(); haystackCache.set(b, h); }
        if (!h.includes(q)) return false;
      }
      const cats = (b.categories || b.genres || []).map((c: string) => c.toUpperCase().trim());
      if (categoryFilter !== "All" && !cats.includes(categoryFilter.toUpperCase().trim())) return false;
      if (formatFilter !== "All" && b.format !== formatFilter) return false;
      return matchesStatus(b, statusFilter);
    });
    const price = (b: any) => priceInfo(b).price;
    const cmp: Record<SortKey, (a: any, b: any) => number> = {
      // Same order as the storefront's "Featured" sort (CatalogControls): arranged books, then newest.
      shop: (a, b) => compareShopOrder(a, b) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      newest: (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      oldest: (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      title: (a, b) => String(a.title || "").localeCompare(String(b.title || "")),
      "price-asc": (a, b) => price(a) - price(b),
      "price-desc": (a, b) => price(b) - price(a),
      "stock-asc": (a, b) => stockOf(a).sortValue - stockOf(b).sortValue || 0,
      "stock-desc": (a, b) => stockOf(b).sortValue - stockOf(a).sortValue || 0,
    };
    return [...list].sort(cmp[sort]);
  }, [books, q, categoryFilter, formatFilter, statusFilter, stockFilter, sort, haystackCache, authors, stockOf]);

  useEffect(() => { setPage(1); setSelected([]); }, [q, categoryFilter, formatFilter, statusFilter, stockFilter, sort]);

  // Shop order shows every book on one page so any book can be dragged to any place.
  const pageSize = sort === "shop" ? Math.max(rows.length, 1) : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = rows.slice((cur - 1) * pageSize, cur * pageSize);

  // Arranging works on the whole catalog, so it is offered only when no search or filter hides books.
  const statusCounts = useMemo(() => Object.fromEntries(STATUS_CHIPS.map((v) => [v, books.filter((b) => matchesStatus(b, v)).length])) as Record<typeof STATUS_CHIPS[number], number>, [books]);
  const soldOut = useMemo(() => books.filter((b) => matchesStatus(b, "Published") && stockOf(b).kind === "soldout").length, [books, stockOf]);
  const filtering = !!q || statusFilter !== "All" || stockFilter !== "All" || categoryFilter !== "All" || formatFilter !== "All";
  const canArrange = sort === "shop" && !filtering && !savingOrder;
  const moveBook = async (id: string, to: number) => {
    const ids = rows.map(b => b.id);
    const next = moveId(ids, id, to);
    const writes = shopOrderWrites(next, books);
    if (!writes.length) return;
    const rank = new Map(writes.map(w => [w.id, w.sortOrder]));
    setBooks(prev => prev.map(b => (rank.has(b.id) ? { ...b, sortOrder: rank.get(b.id) } : b)));
    setSavingOrder(true);
    try { await adminApi.saveBookOrder(writes); }
    catch { toast.error("Couldn't save the new order. Reloading the list."); await loadBooks(); }
    finally { setSavingOrder(false); }
  };
  const allSelected = pageRows.length > 0 && pageRows.every(b => selected.includes(b.id));
  const toggle = (id: string) => setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  // Select page adds/removes this page only; selections on other pages are kept.
  const togglePage = () => {
    const ids = pageRows.map(b => b.id);
    setSelected(p => (allSelected ? p.filter(id => !ids.includes(id)) : [...new Set([...p, ...ids])]));
  };

  const selectedBooks = useMemo(() => books.filter(b => selected.includes(b.id)), [books, selected]);
  const references = useMemo(() => (confirm?.kind === "bulk" ? bookReferences(selected, books) : confirm?.kind === "one" ? bookReferences([confirm.book.id], books) : []), [confirm, selected, books]);
  const referenceText = references.length
    ? ` Still used by other books: ${references.map(r => `“${r.title}” (in ${r.usedBy.join(", ")})`).join("; ")}. Those box sets / recommendations will lose it.`
    : "";

  const finish = async (failedBooks: any[], ok: string, action: string) => {
    setSelected(failedBooks.map(b => b.id));
    if (failedBooks.length) toast.error(`Could not ${action}: ${failedBooks.map(b => b.title || "Untitled").join(", ")}. These books remain selected for retry.`);
    else toast.success(ok);
    await loadBooks();
  };

  const bulkDelete = async () => {
    const list = selectedBooks;
    if (!list.length) return;
    const bad = await eachBook(list, b => adminApi.deleteBook(b.id));
    await finish(bad, `Deleted ${list.length - bad.length} title${list.length - bad.length === 1 ? "" : "s"}`, "delete");
  };

  const pricePlan = useMemo(
    () => (priceOpen && priceValue.trim() !== "" ? planPriceChange(selectedBooks, priceMode, Number(priceValue), { includeEditions }) : { changes: [], skipped: [] }),
    [priceOpen, selectedBooks, priceMode, priceValue, includeEditions]);

  const applyPrices = async () => {
    const changes = pricePlan.changes;
    setPriceOpen(false);
    if (!changes.length) return;
    // Pass the loaded book so edition stock keeps its live value (keepLiveStock).
    const targets = changes.map(c => byId.get(c.id)).filter(Boolean);
    const bad = await eachBook(targets, b => adminApi.updateBook(b.id, { title: b.title, ...changes.find(c => c.id === b.id)!.patch }, b));
    await finish(bad, `Updated ${changes.length - bad.length} price${changes.length === 1 ? "" : "s"}`, "change the price of");
  };

  const bulkFeature = async (featured: boolean) => {
    const bad = await eachBook(selectedBooks, b => adminApi.updateBook(b.id, { title: b.title, isFeatured: featured, featured }));
    await finish(bad, featured ? "Marked as featured" : "Removed from featured", featured ? "feature" : "unfeature");
  };

  const openBulk = async () => {
    setBulkOpen(true);
    try {
      const [settings, sh] = await Promise.all([adminApi.getPublicSettings(), adminApi.getShippingProfiles()]);
      const cats = (settings as any)?.design?.categories;
      setShopCategories(Array.isArray(cats) ? normalizeCategories(cats).filter((c: any) => c?.name && c.name !== "PUBLICATIONS") : []);
      setProfiles(sh);
    } catch { toast.error("Couldn't load categories and shipping profiles. Close and try again."); }
  };

  const applyBulk = async () => {
    const list = selectedBooks;
    setBulkBusy(true);
    try {
      if (bulkOp === "category-add" || bulkOp === "category-remove") {
        const category = shopCategories.find(c => c.id === bulkTarget);
        if (!category) { toast.error("Choose a category."); return; }
        // One transaction over fresh records; only categories/genres change (studio/categoryManager).
        await adminApi.updateCategoryBooks(list.map(b => b.id), category, bulkOp === "category-add" ? "add" : "remove");
        await finish([], `${bulkOp === "category-add" ? "Added to" : "Removed from"} ${category.name}`, "");
      } else if (bulkOp === "shipping") {
        if (!bulkTarget) { toast.error("Choose a shipping profile."); return; }
        await adminApi.assignProductsToShippingProfile(bulkTarget, list.map(b => b.id));
        await finish([], "Shipping profile set", "");
      } else {
        const patch: Record<string, any> = bulkOp === "track-on" ? { trackInventory: true } : bulkOp === "track-off" ? { trackInventory: false }
          : bulkOp === "backorder-on" ? { allowBackorder: true } : bulkOp === "backorder-off" ? { allowBackorder: false } : { status: "archived" };
        const bad = await eachBook(list, b => adminApi.updateBook(b.id, { title: b.title, ...patch }, b));
        await finish(bad, `Updated ${list.length - bad.length} book${list.length - bad.length === 1 ? "" : "s"}`, "update");
      }
      setBulkOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Bulk edit failed. Nothing was changed.");
    } finally { setBulkBusy(false); }
  };

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    const list = exportScope === "selected" ? selectedBooks : exportScope === "filtered" ? rows : books;
    if (!list.length) return toast.error("Nothing to export");
    const day = new Date().toISOString().slice(0, 10);
    if (exportKind === "inventory") download(`inventory-${day}.csv`, inventoryCsv(list));
    else download(`books-${day}.csv`, catalogToCsv(list));
    setExportOpen(false);
  };

  // New books from an import arrive as drafts: select them so Publish (with its review) is one click away.
  const importDone = (createdIds: string[]) => {
    if (createdIds.length) {
      setStatusFilter("All"); setStockFilter("All"); setCategoryFilter("All"); setFormatFilter("All"); setSearch("");
      setTimeout(() => setSelected(createdIds));
    }
    loadBooks();
  };

  const deleteOne = async (book: any) => {
    try {
      await adminApi.deleteBook(book.id);
      setSelected((s) => s.filter((id) => id !== book.id));
      toast.success("Title deleted");
      loadBooks();
    } catch { toast.error("Failed to delete"); }
  };

  const duplicate = async (b: any) => {
    try {
      const copy = await adminApi.duplicateBook(b.id);
      toast.success("Copy created as a draft — add its own ISBN, SKU and stock");
      loadBooks();
      onEdit(copy);
    } catch { toast.error("Failed to duplicate"); }
  };

  const saveInline = async () => {
    if (!inline) return;
    const book = byId.get(inline.id);
    const n = Number(inline.value);
    const field = inline.field;
    if (!book) return setInline(null);
    if (inline.value.trim() === "" || !Number.isFinite(n) || n < 0 || (field === "stockLevel" && !Number.isInteger(n))) {
      toast.error(field === "stockLevel" ? "Stock must be a whole number (0 or more)." : "Price must be 0 or more.");
      return;
    }
    const value = field === "retailPrice" ? Math.round(n * 100) / 100 : n;
    setInline(null);
    if (Number(book[field]) === value) return;
    if (field === "retailPrice" && book.isOnSale && Number(book.salePrice) >= value)
      toast(`Note: the sale price CA$${Number(book.salePrice).toFixed(2)} is not below the new price.`);
    if (field === "stockLevel") {
      // Stock goes through the safe path (live-count check + a row in the title's stock history), like Inventory.
      try {
        const res = await inventoryApi.adjustStock(book.id, null, { kind: "set", to: value, expected: liveStockOf(book, null) ?? 0 }, { reason: "Count correction", title: book.title });
        if (!res.ok) {
          toast.error(res.reason === "conflict" ? `${book.title} changed to ${res.live} since the list loaded (a sale?). Not saved — check the number and try again.`
            : res.reason === "linked" ? `${book.title} is counted in the inventory app. Change it there; the website follows.`
            : res.reason === "missing" ? `${book.title} no longer exists.`
            : `${book.title} isn't counted, so its stock can't be changed here.`);
        } else toast.success(`${book.title}: stock ${res.to}`);
        loadBooks();
      } catch { toast.error(`Could not save ${book.title}.`); }
      return;
    }
    try {
      // `book` is what the table loaded: a sale since then keeps its live stock (only the price is written).
      await adminApi.updateBook(book.id, { title: book.title, [field]: value }, book);
      toast.success(`${book.title}: CA$${value.toFixed(2)}`);
      loadBooks();
    } catch { toast.error(`Could not save ${book.title}.`); }
  };

  const inlineCell = (b: any, field: "retailPrice" | "stockLevel", shown: React.ReactNode) => {
    if (inline && inline.id === b.id && inline.field === field) {
      return (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input className="rp-input" style={{ width: 90 }} type="number" min={0} step={field === "retailPrice" ? "0.01" : "1"} autoFocus
            aria-label={`${field === "retailPrice" ? "Price (CAD)" : "Stock"} for ${b.title}`} value={inline.value}
            onChange={e => setInline({ ...inline, value: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") saveInline(); if (e.key === "Escape") setInline(null); }} />
          <SecondaryButton size="sm" onClick={saveInline}>Save</SecondaryButton>
        </span>
      );
    }
    if (field === "stockLevel" && Array.isArray(b.variants) && b.variants.length && inlineEditable({ ...b, variants: [] })) {
      return (
        <button type="button" className="rp-cell-edit" title="Click to change each edition's stock"
          aria-label={`Edit stock of ${b.title} (by edition)`} onClick={() => setStockEditId(b.id)}>{shown}</button>
      );
    }
    if (field === "stockLevel" && stockLinks[b.id]?.["_"]) return <span title="Counted in the inventory app">{shown}</span>;
    if (!inlineEditable(b) || (field === "stockLevel" && !b.trackInventory)) return shown;
    return (
      <button type="button" className="rp-cell-edit" title="Click to edit"
        aria-label={`Edit ${field === "retailPrice" ? "price" : "stock"} of ${b.title}`}
        onClick={() => setInline({ id: b.id, field, value: String(b[field] ?? 0) })}>{shown}</button>
    );
  };

  const arrangeColumn: Column<any> = { key: "arrange", header: "Order", render: b => {
    const at = rows.findIndex(x => x.id === b.id);
    return (
      <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
        <span aria-hidden="true" title={canArrange ? "Drag to move" : undefined}
          style={{ cursor: canArrange ? "grab" : "default", opacity: canArrange ? 1 : 0.35, display: "inline-flex" }}><GripVertical size={16} /></span>
        <span className="rp-mono" style={{ minWidth: 18, textAlign: "right" }}>{at + 1}</span>
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Move ${b.title} up`} disabled={!canArrange || at <= 0}
          onClick={() => moveBook(b.id, at - 1)}><ArrowUp size={14} aria-hidden /></button>
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Move ${b.title} down`} disabled={!canArrange || at >= rows.length - 1}
          onClick={() => moveBook(b.id, at + 1)}><ArrowDown size={14} aria-hidden /></button>
      </span>
    );
  } };

  const dragRow = (b: any): React.HTMLAttributes<HTMLTableRowElement> | undefined => !canArrange ? undefined : {
    draggable: true,
    onDragStart: e => { setDragId(b.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); },
    onDragOver: e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: e => { e.preventDefault(); const id = dragId; setDragId(null); if (id && id !== b.id) moveBook(id, rows.findIndex(x => x.id === b.id)); },
    onDragEnd: () => setDragId(null),
    style: dragId === b.id ? { opacity: 0.4 } : undefined,
  };

  const coverOf = (b: any, w = 36) => {
    const box = { flexShrink: 0, width: w, height: Math.round(w * 1.4) };
    return b.photoUrl || b.photos?.[0]?.url
      ? <img src={b.photoUrl || b.photos?.[0]?.url} alt="" width={box.width} height={box.height} loading="lazy" decoding="async" className="bk-card-cover" style={box} />
      : <span aria-hidden="true" className="bk-card-cover" style={box} />;
  };
  const titleOf = (b: any) => (
    <div style={{ minWidth: 0 }}>
      <button type="button" className="rp-row-link" onClick={() => onEdit(b)} aria-label={`Edit ${b.title}`}>{b.title || "Untitled"}</button>
      <div className="rp-hint" style={{ overflowWrap: "anywhere" }}>{bookAuthor(b, authors) || "No author"}</div>
    </div>
  );
  const badgesOf = (b: any) => { const s = publicationBadge(b); return <span className="bk-card-badges"><StatusBadge tone={s.tone}>{s.text}</StatusBadge>{(b.isFeatured ?? b.featured) && <StatusBadge tone="primary">Featured</StatusBadge>}{b.comingSoon === true && <StatusBadge tone="info">Coming soon</StatusBadge>}{preorderActive(b) && <StatusBadge tone="info">{releaseDateOf(b) ? `Pre-order · ${releaseDateOf(b)}` : "Pre-order"}</StatusBadge>}</span>; };
  const stockCell = (b: any) => { const s = stockOf(b); return inlineCell(b, "stockLevel", <StatusBadge tone={s.tone}>{s.text}</StatusBadge>); };
  const priceCell = (b: any) => {
    const p = priceInfo(b);
    return inlineCell(b, "retailPrice", <span>{p.was !== undefined && <s className="rp-hint" style={{ marginRight: 6 }}>CA${p.was.toFixed(2)}</s>}{p.text}</span>);
  };
  const actionsOf = (b: any) => (
    <ActionMenu label={`Actions for ${b.title}`} actions={[
      { label: "Edit", onSelect: () => onEdit(b) },
      { label: "Duplicate", onSelect: () => duplicate(b) },
      { label: "View listing", onSelect: () => window.open(listingUrl(b), "_blank", "noopener") },
      { label: "Delete", tone: "danger", onSelect: () => setConfirm({ kind: "one", book: b }) },
    ]} />
  );

  const columns: Column<any>[] = [
    ...(sort === "shop" ? [arrangeColumn] : []),
    { key: "sel", header: "Select", render: b => <Checkbox label="" aria-label={`Select ${b.title}`} checked={selected.includes(b.id)} onChange={() => toggle(b.id)} /> },
    { key: "title", header: "Title", lead: true, render: b => (
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 220 }}>{coverOf(b)}{titleOf(b)}</div>
    ) },
    { key: "status", header: "Status", render: badgesOf },
    { key: "format", header: "Format", render: b => b.format || "—" },
    { key: "isbn", header: "ISBN / SKU", render: b => <span className="rp-mono">{b.isbn || b.sku || "—"}</span> },
    { key: "stock", header: "Inventory", render: stockCell },
    { key: "price", header: "Price", numeric: true, render: priceCell },
    { key: "actions", header: "Actions", render: actionsOf },
  ];

  // Phones: the same rows as cards (the table would scroll sideways).
  const phoneCards = (
    <ul className="bk-cards" aria-label="Books">
      {pageRows.map(b => {
        const at = rows.findIndex(x => x.id === b.id);
        return (
          <li key={b.id} className="bk-card">
            <Checkbox label="" aria-label={`Select ${b.title}`} checked={selected.includes(b.id)} onChange={() => toggle(b.id)} />
            {coverOf(b, 52)}
            <div className="bk-card-body">
              {titleOf(b)}
              {badgesOf(b)}
              <div className="bk-card-foot">
                {stockCell(b)}
                <strong>{priceCell(b)}</strong>
                {sort === "shop" && (
                  <span className="bk-card-order">
                    <span className="rp-mono">#{at + 1}</span>
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Move ${b.title} up`} disabled={!canArrange || at <= 0} onClick={() => moveBook(b.id, at - 1)}><ArrowUp size={14} aria-hidden /></button>
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Move ${b.title} down`} disabled={!canArrange || at >= rows.length - 1} onClick={() => moveBook(b.id, at + 1)}><ArrowDown size={14} aria-hidden /></button>
                  </span>
                )}
                {actionsOf(b)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (loading) return <LoadingState label="Loading books…" />;
  if (failed) return <ErrorState description="Your books could not be loaded." onRetry={() => { setLoading(true); loadBooks(); }} />;

  if (books.length === 0) {
    return (
      <SectionCard>
        <EmptyState icon="📚" title="No books yet" description="Add your first title to start selling — it appears on the storefront as soon as it's published."
          action={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={onAdd}>Add book</PrimaryButton>
            <SecondaryButton icon={<Upload size={16} aria-hidden />} onClick={() => setImportOpen(true)}>Import CSV</SecondaryButton>
          </div>} />
        {importOpen && <BookImportDialog books={books} onClose={() => setImportOpen(false)} onDone={importDone} />}
      </SectionCard>
    );
  }

  const resetFilters = () => { setSearch(""); setStatusFilter("All"); setStockFilter("All"); setCategoryFilter("All"); setFormatFilter("All"); };
  const activeFilters = [statusFilter, stockFilter, categoryFilter, formatFilter].filter(v => v !== "All").length;

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid">
        <MetricCard label="Titles" value={books.length} footer={`${statusCounts.Draft} draft · ${statusCounts.Archived} archived`} />
        <MetricCard label="Published" value={statusCounts.Published} footer={`${statusCounts.Scheduled} scheduled`} />
        <MetricCard label="Sold out" value={soldOut} tone={soldOut ? "danger" : undefined} footer="Published, cannot be bought" />
        <MetricCard label="Pre-order · coming soon" value={statusCounts["Pre-order"] + statusCounts["Coming soon"]} footer={`${statusCounts["Pre-order"]} pre-order · ${statusCounts["Coming soon"]} coming soon`} />
      </div>
      <Tabs label="Publication status" value={statusFilter} onChange={setStatusFilter}
        tabs={STATUS_CHIPS.map((v) => ({ id: v, label: v, count: statusCounts[v] }))} />
      <div className="bk-filters" data-open={filtersOpen}>
      <FilterBar>
        <div className="rp-grow"><SearchField label="Search books" placeholder="Search title, author, ISBN or SKU…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <SecondaryButton className="bk-filter-toggle" icon={<SlidersHorizontal size={16} aria-hidden />} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
          {filtersOpen ? "Hide filters" : `Filters & sort${activeFilters ? ` (${activeFilters})` : ""}`}
        </SecondaryButton>
        <div className="bk-filter-extra">
          <SelectField label="Stock" hideLabel value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
            {STOCK_FILTERS.map(v => <option key={v} value={v}>{v === "All" ? "All stock" : v}</option>)}
            <option value="Needs review">Needs publish review</option>
          </SelectField>
        </div>
        <div className="bk-filter-extra">
          <SelectField label="Category" hideLabel value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            {categories.map(v => <option key={v} value={v}>{v === "All" ? "All categories" : v}</option>)}
          </SelectField>
        </div>
        <div className="bk-filter-extra">
          <SelectField label="Format" hideLabel value={formatFilter} onChange={e => setFormatFilter(e.target.value)}>
            {formats.map(v => <option key={v} value={v}>{v === "All" ? "All formats" : v}</option>)}
          </SelectField>
        </div>
        <div className="bk-filter-extra">
          <SelectField label="Sort books" hideLabel value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="shop">Shop order (drag to arrange)</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="stock-asc">Stock: low to high</option>
            <option value="stock-desc">Stock: high to low</option>
          </SelectField>
        </div>
        {filtering && <GhostButton size="sm" icon={<X size={14} aria-hidden />} onClick={resetFilters}>Clear filters</GhostButton>}
      </FilterBar>
      </div>

      {selected.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="bk-bulk">
          <strong className="bk-bulk-count">{selected.length} selected</strong>
          {selected.length < rows.length && <GhostButton size="sm" onClick={() => setSelected(rows.map(b => b.id))}>Select all {rows.length} matching</GhostButton>}
          <GhostButton size="sm" onClick={() => setSelected([])}>Clear selection</GhostButton>
          <span className="bk-bulk-sep" aria-hidden="true" />
          <SecondaryButton size="sm" onClick={() => setReview("publish")}>Publish…</SecondaryButton>
          <SecondaryButton size="sm" onClick={() => setReview("draft")}>Move to draft…</SecondaryButton>
          <SecondaryButton size="sm" onClick={() => setPriceOpen(true)}>Change price…</SecondaryButton>
          <SecondaryButton size="sm" onClick={openBulk}>Bulk edit…</SecondaryButton>
          <ActionMenu label="More actions for the selected books" actions={[
            { label: "Feature on the homepage", onSelect: () => bulkFeature(true) },
            { label: "Stop featuring", onSelect: () => bulkFeature(false) },
            { label: `Export ${selected.length} selected…`, onSelect: () => { setExportScope("selected"); setExportOpen(true); } },
          ]} />
          <DestructiveButton size="sm" onClick={() => setConfirm({ kind: "bulk" })}>Delete…</DestructiveButton>
        </div>
      )}

      <SectionCard flush title="Catalog" collapsible={false}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            {pageRows.length > 0 && <Checkbox label={sort === "shop" ? "Select all" : "Select page"} checked={allSelected} onChange={togglePage} />}
            <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={onAdd}>Add book</PrimaryButton>
            <ActionMenu label="More catalog actions" actions={[
              { label: "Import CSV…", onSelect: () => setImportOpen(true) },
              { label: "Export…", onSelect: () => { setExportScope(selected.length ? "selected" : "filtered"); setExportOpen(true); } },
              { label: "Google Shopping feed", onSelect: () => setFeedOpen(true) },
              { label: "Google indexing", onSelect: () => setIndexOpen(true) },
            ]} />
          </div>
        }>
        {sort === "shop" && (
          <p className="rp-hint" role="status" style={{ padding: "8px 16px", margin: 0 }}>
            {filtering
              ? "Clear the search and filters to rearrange — the order covers every book."
              : savingOrder ? "Saving the new order…" : "Drag a grip or use the arrows to set the shop's Featured order."}
          </p>
        )}
        {pageRows.length === 0 ? (
          <EmptyState title="No books match" description="Nothing fits this search and these filters. Clear them to see every book."
            action={<SecondaryButton onClick={resetFilters}>Clear filters</SecondaryButton>} />
        ) : (
          <>
            <div className="bk-table"><DataTable caption="Books" columns={columns} rows={pageRows} rowKey={b => b.id} rowProps={dragRow} /></div>
            {phoneCards}
          </>
        )}
        {rows.length > pageSize && <Pagination page={cur} pageCount={pageCount} onPage={setPage} />}
      </SectionCard>

      {importOpen && <BookImportDialog books={books} onClose={() => setImportOpen(false)} onDone={importDone} />}
      <EditionStockDialog book={stockEditId ? byId.get(stockEditId) || null : null} onClose={() => setStockEditId(null)} onSaved={loadBooks} />
      <MerchantFeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} books={books} />
      <GoogleIndexDialog open={indexOpen} onClose={() => setIndexOpen(false)} books={books} />
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} title="Export books"
        footer={<><SecondaryButton onClick={() => setExportOpen(false)}>Cancel</SecondaryButton><PrimaryButton onClick={exportCsv}>Download CSV</PrimaryButton></>}>
        <div className="rp-stack">
          <SelectField label="Which books" value={exportScope} onChange={e => setExportScope(e.target.value as any)}>
            <option value="all">All books ({books.length})</option>
            <option value="filtered">Filtered ({rows.length})</option>
            <option value="selected" disabled={!selected.length}>Selected ({selected.length})</option>
          </SelectField>
          <SelectField label="What" value={exportKind} onChange={e => setExportKind(e.target.value as any)}
            hint={exportKind === "full" ? "Every column Import CSV reads: edit it in a spreadsheet and import it back." : "ID, title, ISBN, SKU, edition and stock — one line per edition — for a stock count."}>
            <option value="full">Full catalog</option>
            <option value="inventory">Inventory only</option>
          </SelectField>
        </div>
      </Dialog>
      <Dialog open={bulkOpen} onClose={() => { if (!bulkBusy) setBulkOpen(false); }} title={`Bulk edit ${selected.length} title${selected.length === 1 ? "" : "s"}`}
        footer={<><SecondaryButton disabled={bulkBusy} onClick={() => setBulkOpen(false)}>Cancel</SecondaryButton><PrimaryButton disabled={bulkBusy} onClick={applyBulk}>{bulkBusy ? "Applying…" : "Apply"}</PrimaryButton></>}>
        <div className="rp-stack">
          <SelectField label="Change" value={bulkOp} onChange={e => { setBulkOp(e.target.value as BulkOp); setBulkTarget(""); }}>
            <option value="category-add">Add to a shop category</option>
            <option value="category-remove">Remove from a shop category</option>
            <option value="shipping">Set shipping profile</option>
            <option value="track-on">Track inventory: on</option>
            <option value="track-off">Track inventory: off</option>
            <option value="backorder-on">Allow backorders: on</option>
            <option value="backorder-off">Allow backorders: off</option>
            <option value="archive">Archive (hide from the shop)</option>
          </SelectField>
          {(bulkOp === "category-add" || bulkOp === "category-remove") && (
            <SelectField label="Category" value={bulkTarget} onChange={e => setBulkTarget(e.target.value)} hint="Published categories only; up to 400 books at a time.">
              <option value="">Choose…</option>
              {shopCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
          )}
          {bulkOp === "shipping" && (
            <SelectField label="Shipping profile" value={bulkTarget} onChange={e => setBulkTarget(e.target.value)}>
              <option value="">Choose…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
          )}
        </div>
      </Dialog>
      {review && <CatalogReviewDialog books={selectedBooks} action={review} onClose={() => setReview(null)} onConfirm={async chosen => {
        const results = await Promise.allSettled(chosen.map(book => adminApi.updateBook(book.id, { status: review === "publish" ? "published" : "draft" })));
        const failedBooks = chosen.filter((_, index) => results[index].status === "rejected");
        setSelected(failedBooks.map(book => book.id));
        setReview(null);
        if (failedBooks.length) toast.error(`Could not update: ${failedBooks.map(book => book.title).join(", ")}. These books remain selected for retry.`);
        else toast.success(`Updated ${chosen.length} books.`);
        await loadBooks();
      }} />}
      <Dialog open={priceOpen} onClose={() => setPriceOpen(false)} title={`Change price for ${selected.length} title${selected.length === 1 ? "" : "s"}`}
        description="Preview the new prices before anything is saved."
        footer={<><SecondaryButton onClick={() => setPriceOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={applyPrices} disabled={!pricePlan.changes.length}>Apply to {pricePlan.changes.length}</PrimaryButton></>}>
        <div className="rp-stack">
          <SelectField label="How" value={priceMode} onChange={e => setPriceMode(e.target.value as PriceMode)}>
            <option value="percent">Change by percent (e.g. -10 for 10% off)</option>
            <option value="amount">Change by amount (e.g. 2 adds CA$2)</option>
            <option value="set">Set exact price</option>
          </SelectField>
          <TextField label="Value" type="number" step="0.01" value={priceValue} onChange={e => setPriceValue(e.target.value)} />
          <Checkbox label="Include edition prices (books sold in editions)" checked={includeEditions} onChange={e => setIncludeEditions(e.target.checked)} />
          <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18, maxHeight: 200, overflow: "auto" }} aria-label="Price preview">
            {pricePlan.changes.slice(0, 20).map(c => <li key={c.id}>{c.title}: {c.editions
              ? c.editions.map(e => `${e.name} CA$${e.from.toFixed(2)} → CA$${e.to.toFixed(2)}`).join(", ")
              : <>CA${c.from.toFixed(2)} → <strong>CA${c.to.toFixed(2)}</strong></>}</li>)}
            {pricePlan.changes.length > 20 && <li>…and {pricePlan.changes.length - 20} more</li>}
            {!pricePlan.changes.length && <li>No prices would change.</li>}
          </ul>
          {pricePlan.skipped.length > 0 && <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }} aria-label="Skipped books">
            {pricePlan.skipped.map(s => <li key={s.id}>Skipped {s.title}: {s.reason}.</li>)}
          </ul>}
        </div>
      </Dialog>
      <ConfirmDialog open={confirm?.kind === "bulk"} title={`Delete ${selected.length} title${selected.length === 1 ? "" : "s"}?`} confirmLabel="Delete permanently"
        message={`This permanently removes the selected books from the catalog. Set them to draft instead if you may want them back.${referenceText}`}
        onConfirm={() => { setConfirm(null); bulkDelete(); }} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.kind === "one"} title="Delete this title?" confirmLabel="Delete title"
        message={confirm?.kind === "one" ? `Are you sure you want to delete “${confirm.book.title}”? This cannot be undone.${referenceText}` : ""}
        onConfirm={() => { const b = (confirm as any).book; setConfirm(null); deleteOne(b); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
