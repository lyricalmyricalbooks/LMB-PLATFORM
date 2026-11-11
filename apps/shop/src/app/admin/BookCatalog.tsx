// Books, drawn to Julian's "Shop Admin Redesign" mockup (11 November 2026): Import and Add book in the header, four
// tiles (books, on sale online, running low, sold out), then one table in the shop's own order. The older catalog's
// filters, bulk edits, exports and drag-to-arrange left with the redesign; each row keeps a ⋯ menu (edit, duplicate,
// view, post, delete) because nothing else on the page deletes a product.
import { isExampleProduct } from "./exampleProducts";
import { useState, useEffect, useMemo } from "react";
import { Plus, Upload } from "lucide-react";
import "./books.css";
import { useShopSells, useShopWords } from "./shopWords";
import { sellsBooks } from "./sells";
import { compareShopOrder } from "../features/site/shopOrder";
import { BookImportDialog } from "./BookImportDialog";
import { adminApi } from "./api";
import { lowStockThreshold } from "./inventoryInsights";
import toast from "react-hot-toast";
import { ActionMenu, PageActions, ConfirmDialog, EmptyState, ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";
import { LOW_STOCK, bookAuthor, bookReferences, bookTiles, listStatus, priceInfo, stockInfo } from "./catalogList";
import { productHref } from "../lib/productHref";

interface BookCatalogProps {
  onEdit: (book: any) => void;
  onAdd: () => void;
  refreshTrigger?: number;
}

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
  const [deleting, setDeleting] = useState<any | null>(null);
  // Inventory's low-stock line, so "Running low" here matches Inventory, Home and the 8am email.
  const [lowLine, setLowLine] = useState(LOW_STOCK);

  useEffect(() => { loadBooks(); }, [refreshTrigger]);
  useEffect(() => {
    adminApi.getAuthors().then((list: any[]) => setAuthors(Object.fromEntries(list.map(a => [a.id, a.name || ""])))).catch(() => {});
    adminApi.getPublicSettings().then((s: any) => setLowLine(lowStockThreshold(s))).catch(() => {});
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
      toast.success("Copy created as a draft — add its own ISBN, SKU and stock");
      loadBooks();
      onEdit(copy);
    } catch { toast.error("Failed to duplicate"); }
  };

  const actionsOf = (b: any) => (
    <ActionMenu label={`Actions for ${b.title}`} actions={[
      { label: "Edit", onSelect: () => onEdit(b) },
      { label: "Duplicate", onSelect: () => duplicate(b) },
      { label: "View listing", onSelect: () => window.open(listingUrl(b), "_blank", "noopener") },
      // Social posts' composer, started with this product (plan 27.6).
      ...(b.slug ? [{ label: "Post to social", onSelect: () => { window.location.hash = `#social-posts/book/${encodeURIComponent(b.id)}`; } }] : []),
      { label: "Delete", tone: "danger", onSelect: () => setDeleting(b) },
    ]} />
  );

  const importDialog = importOpen && <BookImportDialog books={books} onClose={() => setImportOpen(false)} onDone={() => loadBooks()} />;

  if (loading) return <LoadingState label={w("Loading books…")} />;
  if (failed) return <ErrorState description={w("Your books could not be loaded.")} onRetry={() => { setLoading(true); loadBooks(); }} />;

  if (books.length === 0) {
    return (
      <SectionCard>
        <EmptyState icon="📚" title={w("No books yet")} description={w("Add your first title to start selling — it appears on the storefront as soon as it's published.")}
          action={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={onAdd}>{w("Add book")}</PrimaryButton>
            <SecondaryButton icon={<Upload size={16} aria-hidden />} onClick={() => setImportOpen(true)}>Import spreadsheet</SecondaryButton>
            <SecondaryButton onClick={async () => {
              try { await adminApi.addExampleProducts(sells); toast.success("Example products added. They disappear when you add your first real product."); setLoading(true); await loadBooks(); }
              catch { toast.error("Couldn't add the examples. Try again."); }
            }}>Show example products</SecondaryButton>
          </div>} />
        {importDialog}
      </SectionCard>
    );
  }

  const tile = (label: string, value: number, tone?: "low" | "out") => (
    <div className="bk-tile" data-tone={value > 0 ? tone : undefined}><span>{label}</span><strong>{value}</strong></div>
  );

  return (
    <div className="bk-list-page">
      <PageActions>
        <SecondaryButton onClick={() => setImportOpen(true)}>Import</SecondaryButton>
        <PrimaryButton onClick={onAdd}>{w("Add book")}</PrimaryButton>
      </PageActions>
      <div className="bk-tiles">
        {tile(w("Books"), tiles.books)}
        {tile("On sale online", tiles.online)}
        {tile("Running low", tiles.low, "low")}
        {tile("Sold out", tiles.soldOut, "out")}
      </div>
      {books.some(isExampleProduct) && <p className="rp-hint" role="status" style={{ margin: 0 }}>Some of these are examples so your shop isn't empty. They disappear when you add your first real product.</p>}
      <div className="bk-table-card">
        <table className="bk-list">
          <caption className="rp-sr-only">{w("Books")}</caption>
          <thead><tr>
            <th scope="col">{w("Book")}</th>
            <th scope="col">{sellsBooks(sells) ? "Format · ISBN" : "Format · SKU"}</th>
            <th scope="col" className="bk-num">Price</th>
            <th scope="col" className="bk-num">Online</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="rp-sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map((b, i) => {
              const stock = stockOf(b);
              const st = listStatus(b, stock);
              const photo = b.photoUrl || b.photos?.[0]?.url;
              const by = bookAuthor(b, authors);
              return (
                <tr key={b.id} onClick={() => onEdit(b)}>
                  <td>
                    <span className="bk-list-book">
                      {photo
                        ? <img src={photo} alt="" width={40} height={52} loading="lazy" decoding="async" className="bk-list-cover" />
                        : <span className="bk-list-initials" data-tone={i % 4} aria-hidden="true">{initialsOf(b.title || "")}</span>}
                      <span className="bk-list-who">
                        <button type="button" className="bk-list-title" onClick={(e) => { e.stopPropagation(); onEdit(b); }}>{b.title || "Untitled"}</button>
                        {by && <span className="bk-list-sub">{by}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="bk-list-mono">{[b.format, b.isbn || b.sku].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="bk-num">{priceInfo(b).text}</td>
                  <td className="bk-num">{Number.isFinite(stock.count) ? stock.count : "—"}</td>
                  <td><StatusBadge tone={st.tone} glyph={false}>{st.text}</StatusBadge></td>
                  <td className="bk-list-act" onClick={(e) => e.stopPropagation()}>{actionsOf(b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {importDialog}
      <ConfirmDialog open={!!deleting} title="Delete this title?" confirmLabel="Delete title"
        message={deleting ? `Are you sure you want to delete “${deleting.title}”? This cannot be undone.${referenceText}` : ""}
        onConfirm={() => { const b = deleting; setDeleting(null); deleteOne(b); }} onCancel={() => setDeleting(null)} />
    </div>
  );
}
