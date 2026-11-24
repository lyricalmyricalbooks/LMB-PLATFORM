// Books, drawn to Julian's "Shop Admin Redesign" mockup (11 November 2026): Import and Add book in the header, four
// tiles (books, on sale online, running low, sold out), then one table in the shop's own order. The older catalog's
// filters, exports and drag-to-arrange left with the redesign; each row keeps a ⋯ menu (edit, duplicate, view, post,
// delete) because nothing else on the page deletes a product. v4 (12 November 2026): tick boxes and a bulk bar with Set
// as draft. The mockup's Mark sold out is left out: sold out comes from stock counts, which the stockroom owns.
import { isBookKind, productKind } from "../../shared/productOptions";
import { isExampleProduct } from "./exampleProducts";
import { useState, useEffect, useMemo } from "react";
import { Plus, Rows3, Upload } from "lucide-react";
import "./books.css";
import { useShopSells, useShopWords } from "./shopWords";
import { sellsBooks } from "./sells";
import { compareShopOrder } from "../features/site/shopOrder";
import { BookImportDialog } from "./BookImportDialog";
import { AddSeveralDialog } from "./AddSeveralDialog";
import { useProductGroups } from "./productGroups";
import { sellsGroups } from "../../shared/productTypes";
import { draftsWord } from "./addSeveral";
import { BulkSaleDialog } from "./BulkSaleDialog";
import { planEndSale } from "./bulkPricing";
import { adminApi } from "./api";
import { lowStockThreshold } from "./inventoryInsights";
import toast from "react-hot-toast";
import { ActionMenu, PageActions, ConfirmDialog, EmptyState, ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";
import { LOW_STOCK, bookAuthor, bookReferences, draftableOf, bookTiles, listStatus, priceInfo, publicationState, stockInfo, stockroomCount } from "./catalogList";
import { attentionReasons } from "./needsAttention";
import { combinedAdmin } from "./combined";
import { inventoryLinkApi } from "./inventoryLinkApi";
import type { InventoryLinks } from "./inventoryLink";
import { productHref } from "../lib/productHref";
import { stockText } from "../../shared/soldByAmount";

interface BookCatalogProps {
  onEdit: (book: any, opts?: { rename?: boolean }) => void;
  onAdd: () => void;
  refreshTrigger?: number;
}

// Shop + stockroom: the Stockroom column shows the stockroom's own count beside the copies online.
const COMBINED = combinedAdmin();

const slugOf = (b: any) => b.slug || (b.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Sub-path safe public URL (the site can be served under a sub-path). */
const listingUrl = (b: any) =>
  `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}${productHref(slugOf(b))}`;

/** Two letters for a book with no photo, as on Home's best sellers. */
export const initialsOf = (title: string) =>
  title.split(/\s+/).filter((t) => /^[\p{L}\p{N}]/u.test(t) && !/^(the|a|an|of|and)$/i.test(t)).slice(0, 2).map((t) => t[0]!.toUpperCase()).join("") || "•";

export function BookCatalog({ onEdit, onAdd, refreshTrigger }: BookCatalogProps) {
  // Plan 10.23: "Products" for a shop that doesn't sell books (sells.ts).
  const w = useShopWords();
  const sells = useShopSells();
  const [books, setBooks] = useState<any[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [severalOpen, setSeveralOpen] = useState(false);
  const groups = useProductGroups(sellsGroups(sells));
  const [deleting, setDeleting] = useState<any | null>(null);
  /** Rows ticked on the list (v4 bulk bar). */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [drafting, setDrafting] = useState(false);
  /** Bulk bar › Put on sale is open. */
  const [saleOpen, setSaleOpen] = useState(false);
  // Inventory's low-stock line, so "Running low" here matches Inventory, Home and the 8am email.
  const [lowLine, setLowLine] = useState(LOW_STOCK);
  // The stockroom's counts (its published feed, read by the server) and which stockroom book each edition is matched to.
  const [links, setLinks] = useState<InventoryLinks>({});
  const [onHand, setOnHand] = useState<Map<string, number | null> | null>(null);

  useEffect(() => { loadBooks(); }, [refreshTrigger]);
  useEffect(() => {
    adminApi.getAuthors().then((list: any[]) => setAuthors(Object.fromEntries(list.map(a => [a.id, a.name || ""])))).catch(() => {});
    adminApi.getPublicSettings().then((s: any) => setLowLine(lowStockThreshold(s))).catch(() => {});
    if (COMBINED) {
      inventoryLinkApi.links().then(setLinks).catch(() => {});
      inventoryLinkApi.catalog().then((r) => setOnHand(new Map((r.books || []).map((b) => [b.id, b.onHand])))).catch(() => setOnHand(new Map()));
    }
  }, []);

  async function loadBooks() {
    setFailed(false);
    try {
      setBooks(await adminApi.getAllBooks());
    } catch (err) {
      console.error(err);
      setFailed(true);
      toast.error(w("Failed to load books"));
    } finally {
      setLoading(false);
    }
  }

  const byId = useMemo(() => new Map(books.map(b => [b.id, b])), [books]);
  const stockOf = useMemo(() => {
    const cache = new Map<any, ReturnType<typeof stockInfo>>();
    return (b: any) => { let s = cache.get(b); if (!s) { s = stockInfo(b, id => byId.get(id), lowLine); cache.set(b, s); } return s; };
  }, [byId, lowLine]);
  // The storefront's "Featured" order: arranged books first, then newest.
  const rows = useMemo(() => [...books].sort((a, b) => compareShopOrder(a, b) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))), [books]);
  const tiles = useMemo(() => bookTiles(books, stockOf), [books, stockOf]);
  // Round 3, "Needs attention": live products shoppers can see with no photo, weight or stock, or a blank legal fact.
  const reasons = useMemo(() => new Map(books.map((b) => [b.id, attentionReasons(b, stockOf(b), publicationState(b) === "published")])), [books, stockOf]);
  const attentionCount = books.filter((b) => (reasons.get(b.id) || []).length).length;
  const [attentionOnly, setAttentionOnly] = useState(false);
  const shownRows = attentionOnly ? rows.filter((b) => (reasons.get(b.id) || []).length) : rows;

  const references = useMemo(() => (deleting ? bookReferences([deleting.id], books) : []), [deleting, books]);
  const referenceText = references.length
    ? `${w(" Still used by other books: ")}${references.map(r => `“${r.title}” (in ${r.usedBy.join(", ")})`).join("; ")}. Those box sets / recommendations will lose it.`
    : "";

  const deleteOne = async (book: any) => {
    try {
      await adminApi.deleteBook(book.id);
      toast.success("Title deleted");
      loadBooks();
    } catch { toast.error("Failed to delete"); }
  };

  const duplicate = async (b: any) => {
    try {
      const copy = await adminApi.duplicateBook(b.id);
      toast.success(isBookKind(productKind(b)) ? "Copy made as a draft. Give it its own name, ISBN, photos and stock." : "Copy made as a draft. Give it its own name, photos and stock.");
      loadBooks();
      onEdit(copy, { rename: true });
    } catch { toast.error("Couldn't make the copy. Check your connection and try again."); }
  };

  const actionsOf = (b: any) => (
    <ActionMenu label={`Actions for ${b.title}`} actions={[
      { label: "Edit", onSelect: () => onEdit(b) },
      { label: "Make a copy", onSelect: () => duplicate(b) },
      { label: "View listing", onSelect: () => window.open(listingUrl(b), "_blank", "noopener") },
      // Social posts' composer, started with this product (plan 27.6).
      ...(b.slug ? [{ label: "Post to social", onSelect: () => { window.location.hash = `#social-posts/book/${encodeURIComponent(b.id)}`; } }] : []),
      { label: "Delete", tone: "danger", onSelect: () => setDeleting(b) },
    ]} />
  );

  // v4 bulk bar: Set as draft takes the ticked products off the shop. Only `status` is written, through the same
  // transactional save as the editor, so stock and every other field keep their live values.
  const setAsDraft = async () => {
    const { change, already } = draftableOf(books, picked);
    if (!change.length) { toast("Those are drafts already"); setPicked(new Set()); return; }
    setDrafting(true);
    const failedIds: string[] = [];
    for (const b of change) {
      try { await adminApi.updateBook(b.id, { title: b.title, status: "draft" }, b); }
      catch { failedIds.push(b.id); }
    }
    setDrafting(false);
    setPicked(new Set(failedIds));
    await loadBooks();
    const done = change.length - failedIds.length;
    const parts = [done ? `${done} set as draft` : "", already ? `${already} already a draft` : ""].filter(Boolean);
    if (failedIds.length) toast.error(`${parts.join(". ")}${parts.length ? ". " : ""}Couldn't change ${failedIds.length}: try again.`);
    else toast.success(`${parts.join(". ")}. They're off the shop until you publish them.`);
  };

  // Bulk bar › Put on sale / End sale (gap list item 5): writes only the four sale fields through the editor's
  // transactional save, one product at a time; failed rows stay ticked.
  const savePatches = async (changes: { id: string; patch: Record<string, any> }[], done: (n: number) => string) => {
    const failedIds: string[] = [];
    for (const c of changes) {
      const b = books.find((x) => x.id === c.id);
      try { await adminApi.updateBook(c.id, { title: b?.title, ...c.patch }, b); }
      catch { failedIds.push(c.id); }
    }
    setPicked(new Set(failedIds));
    await loadBooks();
    const ok = changes.length - failedIds.length;
    if (failedIds.length) toast.error(`${ok ? `${done(ok)} ` : ""}Couldn't change ${failedIds.length}: try again.`);
    else toast.success(done(ok));
  };
  const endSale = async () => {
    const changes = planEndSale(books.filter((b) => picked.has(b.id)));
    if (!changes.length) { toast("None of those are on sale"); return; }
    setDrafting(true);
    try { await savePatches(changes, (n) => `Sale ended on ${n}. Shoppers see the regular price.`); } finally { setDrafting(false); }
  };

  const importDialog = importOpen && <BookImportDialog books={books} onClose={() => setImportOpen(false)} onDone={() => loadBooks()} />;
  const severalDialog = severalOpen && <AddSeveralDialog groups={groups} onClose={() => { setSeveralOpen(false); void loadBooks(); }}
    onDone={(made, finished) => { if (!finished) return; setSeveralOpen(false); toast.success(`${draftsWord(made)} added. Finish each one when you're ready.`); setLoading(true); void loadBooks(); }} />;

  if (loading) return <LoadingState label={w("Loading books…")} />;
  if (failed) return <ErrorState description={w("Your books could not be loaded.")} onRetry={() => { setLoading(true); loadBooks(); }} />;

  if (books.length === 0) {
    return (
      <SectionCard>
        <EmptyState sketch="cards" icon="📚" title={w("No books yet")} description={w("Add your first title to start selling — it shows on your website as soon as it's published.")}
          action={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={onAdd}>{w("Add book")}</PrimaryButton>
            <SecondaryButton icon={<Rows3 size={16} aria-hidden />} onClick={() => setSeveralOpen(true)}>{w("Add several books")}</SecondaryButton>
            <SecondaryButton icon={<Upload size={16} aria-hidden />} onClick={() => setImportOpen(true)}>Import spreadsheet</SecondaryButton>
            <SecondaryButton onClick={async () => {
              try { await adminApi.addExampleProducts(sells); toast.success("Example products added. They disappear when you add your first real product."); setLoading(true); await loadBooks(); }
              catch { toast.error("Couldn't add the examples. Try again."); }
            }}>Show example products</SecondaryButton>
          </div>} />
        {importDialog}
        {severalDialog}
      </SectionCard>
    );
  }

  const tile = (label: string, value: number, tone?: "low" | "out") => (
    <div className="bk-tile" data-tone={value > 0 ? tone : undefined}><span>{label}</span><strong>{value}</strong></div>
  );

  const tickedHere = shownRows.filter((b) => picked.has(b.id)).length;
  const allTicked = shownRows.length > 0 && tickedHere === shownRows.length;
  const tick = (id: string, on: boolean) => setPicked((p) => { const next = new Set(p); if (on) next.add(id); else next.delete(id); return next; });

  return (
    <div className="bk-list-page">
      <PageActions>
        <SecondaryButton onClick={() => setImportOpen(true)}>Import</SecondaryButton>
        <SecondaryButton onClick={() => setSeveralOpen(true)}>Add several</SecondaryButton>
        <PrimaryButton onClick={onAdd}>{w("Add book")}</PrimaryButton>
      </PageActions>
      <div className="bk-tiles">
        {tile(w("Books"), tiles.books)}
        {tile("On sale online", tiles.online)}
        {tile("Running low", tiles.low, "low")}
        {tile("Sold out", tiles.soldOut, "out")}
      </div>
      {books.some(isExampleProduct) && <p className="rp-hint" role="status" style={{ margin: 0 }}>Some of these are examples so your shop isn't empty. They disappear when you add your first real product.</p>}
      {(attentionCount > 0 || attentionOnly) && (
        <div className="bk-views" role="group" aria-label={w("Which books to show")}>
          <button type="button" className="bk-view" aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>All <span>{books.length}</span></button>
          <button type="button" className="bk-view" data-tone="attention" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>Needs attention <span>{attentionCount}</span></button>
          {attentionOnly && <p className="bk-views-note">{w("Live books shoppers can see that are missing a photo, a weight, stock or a fact the law asks for.")}</p>}
        </div>
      )}
      {attentionOnly && attentionCount === 0 && <p className="rp-hint" role="status" style={{ margin: 0 }}>Nothing needs attention now.</p>}
      <div className="bk-table-card">
        {picked.size > 0 && (
          <div className="bk-bulk" role="region" aria-label={w("Selected books")}>
            <strong>{picked.size} selected</strong>
            <button type="button" className="bk-bulk-btn" onClick={() => void setAsDraft()} disabled={drafting}>{drafting ? "Saving…" : "Set as draft"}</button>
            <button type="button" className="bk-bulk-btn" onClick={() => setSaleOpen(true)} disabled={drafting}>Put on sale</button>
            <button type="button" className="bk-bulk-clear" onClick={() => void endSale()} disabled={drafting}>End sale</button>
            <button type="button" className="bk-bulk-clear" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        )}
        <table className="bk-list">
          <caption className="rp-sr-only">{w("Books")}</caption>
          <thead><tr>
            <th scope="col" className="bk-check"><input type="checkbox" aria-label={w("Select every book")} checked={allTicked}
              ref={(el) => { if (el) el.indeterminate = tickedHere > 0 && !allTicked; }}
              onChange={(e) => setPicked(e.target.checked ? new Set(shownRows.map((b) => b.id)) : new Set())} /></th>
            <th scope="col">{w("Book")}</th>
            <th scope="col" className="bk-wide">{sellsBooks(sells) ? "Format · ISBN" : "Format · item code"}</th>
            <th scope="col" className="bk-num bk-wide">Price</th>
            <th scope="col" className="bk-num bk-wide">Online</th>
            {COMBINED && <th scope="col" className="bk-num bk-wide">Stockroom</th>}
            <th scope="col">Status</th>
            <th scope="col"><span className="rp-sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {shownRows.map((b, i) => {
              const stock = stockOf(b);
              const st = listStatus(b, stock);
              const photo = b.photoUrl || b.photos?.[0]?.url;
              const by = bookAuthor(b, authors);
              return (
                <tr key={b.id} onClick={() => onEdit(b)} data-picked={picked.has(b.id) || undefined}>
                  <td className="bk-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${b.title || "Untitled"}`} checked={picked.has(b.id)} onChange={(e) => tick(b.id, e.target.checked)} /></td>
                  <td>
                    <span className="bk-list-book">
                      {photo
                        ? <img src={photo} alt="" width={40} height={52} loading="lazy" decoding="async" className="bk-list-cover" />
                        : <span className="bk-list-initials" data-tone={i % 4} aria-hidden="true">{initialsOf(b.title || "")}</span>}
                      <span className="bk-list-who">
                        <button type="button" className="bk-list-title" onClick={(e) => { e.stopPropagation(); onEdit(b); }}>{b.title || "Untitled"}</button>
                        {by && <span className="bk-list-sub">{by}</span>}
                        {attentionOnly && (reasons.get(b.id) || []).length > 0 && <span className="bk-list-why">{(reasons.get(b.id) || []).join(" · ")}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="bk-list-mono bk-wide">{[b.format, b.isbn || b.sku].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="bk-num bk-wide">{priceInfo(b).text}</td>
                  <td className="bk-num bk-wide">{Number.isFinite(stock.count) ? stockText(b, stock.count) : "—"}</td>
                  {COMBINED && <td className="bk-num bk-wide">{onHand ? stockroomCount(b.id, links, onHand) ?? "—" : "…"}</td>}
                  <td><StatusBadge tone={st.tone} glyph={false}>{st.text}</StatusBadge></td>
                  <td className="bk-list-act" onClick={(e) => e.stopPropagation()}>{actionsOf(b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {importDialog}
      {severalDialog}
      {saleOpen && <BulkSaleDialog books={books.filter((b) => picked.has(b.id))} onClose={() => setSaleOpen(false)}
        onSave={async (changes) => { await savePatches(changes, (n) => `${n} put on sale.`); setSaleOpen(false); }} />}
      <ConfirmDialog open={!!deleting} title="Delete this title?" confirmLabel="Delete title"
        message={deleting ? `Are you sure you want to delete “${deleting.title}”? This cannot be undone.${referenceText}` : ""}
        onConfirm={() => { const b = deleting; setDeleting(null); deleteOne(b); }} onCancel={() => setDeleting(null)} />
    </div>
  );
}
