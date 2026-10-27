import { alternatesFor } from "../../features/site/templateAlternates";
import { useEffect, useState } from "react";
import { adminApi } from "../api";
import { Checkbox, Dialog, PrimaryButton, SecondaryButton, SelectField, TextArea, TextField } from "../riso/components";
import { CATEGORIES } from "../../features/site/constants";
import { childCategories, normalizeCategories, parentOf, referenceCategoryLimit, referenceNavCategories, renameCategory, usesReferenceHeader } from "../../features/site/navItems";
import { ImageUploadButton } from "./ImageUploadButton";
import { deleteCategory, directlyAssigned, validateCategoryName, type CategoryAction } from "./categoryManager";

type Props = {
  design: any; published: any; onChange: (cats: any[]) => void; onReorder?: (cats: any[]) => void; onBooksChanged: (books: any[]) => void;
  /** Riso confirmation (Studio's askConfirm), asked before changes that write the live catalog at once. */
  confirm?: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
};
export function StudioCategories({ design, published, onChange, onReorder, onBooksChanged, confirm }: Props) {
  const cats = normalizeCategories(Array.isArray(design.categories) ? design.categories : [...CATEGORIES]);
  const live = normalizeCategories(published.categories ?? [...CATEGORIES]);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deleteMode, setDeleteMode] = useState("keep");
  const [destination, setDestination] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bookSearch, setBookSearch] = useState("");
  const [action, setAction] = useState<CategoryAction>("add");
  const [membership, setMembership] = useState("all");

  const load = async () => {
    setLoading(true); setLoaded(false); setError("");
    try { setBooks(await adminApi.getCategoryBooks()); setLoaded(true); }
    catch { setError("Could not load the full catalog. Retry before changing book assignments."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const updateBooks = (updated: any[]) => {
    const byId = new Map(updated.map(b => [b.id, b]));
    const next = books.map(b => byId.get(b.id) || b);
    setBooks(next); onBooksChanged(next);
  };
  const open = (category: any) => {
    setEditor({ ...category }); setSelected([]); setBookSearch(""); setMembership("all");
    setDestination(""); setAction("add"); setError(""); setNotice("");
  };
  const saveDetails = () => {
    const validation = validateCategoryName(cats, editor.id, editor.name);
    if (validation) { setError(validation); return; }
    const index = cats.findIndex(c => c.id === editor.id);
    const next = index < 0 ? [...cats, { ...editor, name: editor.name.trim() }] : renameCategory(cats, index, editor.name)
      .map(c => {
        if (c.id !== editor.id) return c;
        const { templateId: _old, ...rest } = c;
        // No template = the key is left out (never saved as undefined).
        return { ...rest, description: editor.description, imageUrl: editor.imageUrl, showInNav: editor.showInNav, parentId: editor.parentId, ...(editor.templateId ? { templateId: editor.templateId } : {}) };
      });
    onChange(next); setEditor(null); setError(""); setNotice("Category details updated in your working design. Publish to update the shop.");
  };
  // Only existing saved-to-the-working-design categories can receive assignments.
  const current = editor && cats.find(c => c.id === editor.id);
  const liveCurrent = current && live.find(c => c.id === current.id);
  const dirtyDetails = editor && (!current || ["name", "description", "imageUrl", "showInNav", "parentId", "templateId"].some(k => (editor[k] ?? "") !== (current[k] ?? "")));
  const filteredBooks = books.filter(b => (!bookSearch || `${b.title || ""} ${b.sku || ""} ${b.isbn || ""}`.toLowerCase().includes(bookSearch.toLowerCase()))
    && (membership === "all" || directlyAssigned(b, current) === (membership === "assigned")))
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const saveAssignments = async () => {
    // Removing or moving books changes the live shop at once and Discard draft can't undo it: ask first.
    if (action !== "add" && confirm) {
      const target = cats.find(c => c.id === destination);
      const ok = await confirm({
        title: action === "move" ? "Move books now?" : "Remove books now?",
        message: `${selected.length} book${selected.length === 1 ? "" : "s"} will be ${action === "move" ? `moved from ${current?.name} to ${target?.name || "the chosen category"}` : `removed from ${current?.name}`}. This changes the live shop now; Discard draft won't undo it.`,
        confirmLabel: action === "move" ? "Move books" : "Remove books",
      });
      if (!ok) return;
    }
    setBusy(true); setError("");
    try {
      const target = cats.find(c => c.id === destination);
      if (!loaded) throw new Error("Reload the full catalog before saving assignments.");
      const updated = await adminApi.updateCategoryBooks(selected, current, action, target);
      updateBooks(updated); setSelected([]);
      setNotice(`Saved assignments for ${updated.length} books to the live catalog.`);
    } catch (e: any) { setError(e.message || "Could not save assignments. Try again."); }
    finally { setBusy(false); }
  };
  const confirmDelete = async () => {
    // Removing or moving the books changes the live catalog at once (Discard draft can't undo it), like Save book assignments: ask first.
    if (deleteMode !== "keep" && confirm && deleting) {
      const target = cats.find(c => c.id === destination);
      const ok = await confirm({
        title: deleteMode === "move" ? "Move the books now?" : "Remove the books now?",
        message: `Every book in ${deleting.name} will be ${deleteMode === "move" ? `moved to ${target?.name || "the chosen category"}` : `taken out of ${deleting.name}`}. This changes the live shop now; Discard draft won't undo it. The category itself leaves the menu when you Publish.`,
        confirmLabel: deleteMode === "move" ? "Move books and delete" : "Remove books and delete",
      });
      if (!ok) return;
    }
    setBusy(true); setError("");
    try {
      if (deleteMode !== "keep") {
        if (!loaded) throw new Error("Reload the full catalog before changing assignments.");
        // Refresh membership rather than deleting from a potentially old picker snapshot.
        const fresh = await adminApi.getCategoryBooks();
        setBooks(fresh); onBooksChanged(fresh);
        const ids = fresh.filter(b => directlyAssigned(b, deleting)).map(b => b.id);
        if (ids.length) await adminApi.updateCategoryBooks(ids, deleting, deleteMode === "move" ? "move" : "remove", cats.find(c => c.id === destination));
        const after = await adminApi.getCategoryBooks();
        setBooks(after); onBooksChanged(after);
        if (after.some(b => directlyAssigned(b, deleting)))
          throw new Error("Assignments were saved, but more books were assigned here during the update. The menu was kept. Retry deletion to include those books.");
      }
      onChange(deleteCategory(cats, deleting.id)); setDeleting(null);
      setNotice("Category removed from your working design. Publish to remove it from the shop menu. Books have been preserved.");
    } catch (e: any) { setError(e.message || "Could not delete this category. No menu changes were made."); }
    finally { setBusy(false); }
  };
  const move = (id: string, delta: number) => {
    const i = cats.findIndex(c => c.id === id), j = i + delta;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats]; [next[i], next[j]] = [next[j], next[i]]; (onReorder || onChange)(next);
  };
  // The default (Reference) shop header shows only the first N visible top-level categories: say so per row.
  const refLimit = usesReferenceHeader(design) ? referenceCategoryLimit(design) : 0;
  const refShown = new Set(refLimit ? referenceNavCategories(cats, design).map(c => c.id) : []);
  const menuState = (c: any) => c.showInNav === false ? "Hidden from menu"
    : refLimit && !parentOf(c, cats) && !refShown.has(c.id) ? "Not in the shop header (over the limit below)" : "Shown in menu";
  const feedback = <>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</>;
  return <section className="studio-categories rp" data-studio-panel="menus:categories">
    <h3>Shop categories</h3>
    <p>Manage category details, menu placement and books. Menu changes stay in Studio until you publish. Book assignments save immediately to the live catalog.</p>
    {!editor && !deleting && feedback}
    {loading ? <p role="status">Loading full catalog…</p> : error && !editor && !deleting && <SecondaryButton onClick={load}>Retry catalog</SecondaryButton>}
    <TextField label="Find categories" value={search} onChange={e => setSearch(e.target.value)} />
    <SecondaryButton onClick={() => open({ id: `cat-${crypto.randomUUID()}`, name: "", description: "", imageUrl: "", showInNav: true, parentId: null })}>Add category</SecondaryButton>
    {refLimit > 0 && <p className="studio-hint" data-reference-limit={refLimit}>Your shop header (Reference layout) shows the first {refLimit === 1 ? "category" : `${refLimit} categories`} in this order. To show more, go to Theme settings › Shop page masthead & covers › Max categories in the nav.</p>}
    {cats.length === 0 && <p>No categories yet. Add one to organize the shop.</p>}
    {cats.filter(c => `${c.name} ${c.description || ""}`.toLowerCase().includes(search.toLowerCase())).map(c => <article key={c.id} className="studio-category-row">
      <div><strong>{c.name}</strong><p>{loading ? "Loading counts…" : !loaded ? "Counts unavailable" : `${books.filter(b => directlyAssigned(b, c)).length} directly assigned books`} · {menuState(c)}</p>
        {parentOf(c, cats) && <p>Under {cats.find(p => p.id === parentOf(c, cats))?.name}</p>}
      </div>
      <div className="studio-category-actions">
        <SecondaryButton onClick={() => open(c)} aria-label={`Edit ${c.name}`}>Edit</SecondaryButton>
        <SecondaryButton onClick={() => { setDeleting(c); setDeleteMode("keep"); setDestination(""); setError(""); setNotice(""); }} aria-label={`Delete ${c.name}`}>Delete</SecondaryButton>
        <SecondaryButton disabled={cats[0].id === c.id} onClick={() => move(c.id, -1)} aria-label={`Move ${c.name} up`}>↑</SecondaryButton>
        <SecondaryButton disabled={cats[cats.length - 1].id === c.id} onClick={() => move(c.id, 1)} aria-label={`Move ${c.name} down`}>↓</SecondaryButton>
      </div>
    </article>)}
    <Dialog open={!!editor} onClose={() => { if (!busy) setEditor(null); }} title={current ? `Edit ${current.name}` : "Add category"} size="lg" appearance="light"
      footer={<><SecondaryButton disabled={busy} onClick={() => setEditor(null)}>Cancel</SecondaryButton><PrimaryButton disabled={busy} onClick={saveDetails}>Apply category details</PrimaryButton></>}>
      {editor && <div className="studio-category-form">
        {feedback}
        <TextField label="Category name" value={editor.name} disabled={busy} onChange={e => setEditor({ ...editor, name: e.target.value })} />
        <TextArea label="Description" value={editor.description || ""} disabled={busy} onChange={e => setEditor({ ...editor, description: e.target.value })} />
        <TextField label="Category image URL (optional)" value={editor.imageUrl || ""} disabled={busy} onChange={e => setEditor({ ...editor, imageUrl: e.target.value })} />
        <ImageUploadButton label="Upload category image" disabled={busy} onUploaded={url => setEditor((current: any) => current && { ...current, imageUrl: url })} />
        <Checkbox label="Show in the shop menu" checked={editor.showInNav !== false} disabled={busy} onChange={e => setEditor({ ...editor, showInNav: e.target.checked })} />
        <SelectField label="Sits under" value={editor.parentId || ""} disabled={busy || childCategories(editor, cats).length > 0} onChange={e => setEditor({ ...editor, parentId: e.target.value || null })}>
          <option value="">Its own spot in the menu</option>{cats.filter(c => c.id !== editor.id && !parentOf(c, cats)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        {childCategories(editor, cats).length > 0 && <p>Move this category’s children elsewhere before making it a subcategory.</p>}
        <SelectField label="Collection page template" value={editor.templateId || ""} disabled={busy}
          hint="Which layout this category's collection page uses. Make more in Page layout › Collection page template › New template from this one."
          onChange={e => { const { templateId: _old, ...rest } = editor; setEditor(e.target.value ? { ...rest, templateId: e.target.value } : rest); }}>
          <option value="">Default collection page</option>
          {alternatesFor(design, "collectionPage").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField>
        {current && <>
          <h3>Book assignments</h3>
          <p>Counts show direct assignments, including earlier category names. Parent menus also include their children. PUBLICATIONS automatically shows every book on the storefront.</p>
          <p>Assignments save immediately; Publish and Discard Draft do not undo them. They use the published category name so a discarded rename keeps books findable. Apply category details before changing assignments.</p>
          {!liveCurrent && <p>Publish this new category before assigning books.</p>}
          <TextField label="Find books by title, SKU or ISBN" value={bookSearch} onChange={e => setBookSearch(e.target.value)} disabled={busy} />
          <SelectField label="Show books" value={membership} onChange={e => setMembership(e.target.value)} disabled={busy}><option value="all">All books</option><option value="assigned">Assigned here</option><option value="unassigned">Not assigned here</option></SelectField>
          <SecondaryButton disabled={busy || !loaded} onClick={() => setSelected(prev => [...new Set([...prev, ...filteredBooks.map(b => b.id)])].slice(0, 400))}>Select matching books (up to 400)</SecondaryButton>
          <SecondaryButton disabled={busy} onClick={() => setSelected([])}>Clear selection</SecondaryButton>
          <div className="studio-category-books">{filteredBooks.map(b => <Checkbox key={b.id} label={`${b.title || "Untitled book"} · ${b.status || "published"}${directlyAssigned(b, current) ? " · assigned" : ""}`} checked={selected.includes(b.id)} disabled={busy || loading} onChange={e => setSelected(e.target.checked ? [...selected, b.id] : selected.filter(id => id !== b.id))} />)}{!loading && !filteredBooks.length && <p>No matching books.</p>}</div>
          <p>{selected.length} books selected (maximum 400 per save).</p>
          <SelectField label="Assignment action" value={action} onChange={e => setAction(e.target.value as CategoryAction)} disabled={busy}><option value="add">Assign to this category</option><option value="remove">Remove from this category</option><option value="move">Move from this category to…</option></SelectField>
          {action === "move" && <SelectField label="Destination category" value={destination} onChange={e => setDestination(e.target.value)} disabled={busy}><option value="">Choose a category</option>{cats.filter(c => c.id !== current.id && live.some(p => p.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>}
          <PrimaryButton disabled={busy || !loaded || !liveCurrent || dirtyDetails || !selected.length || selected.length > 400 || (action === "move" && !destination)} onClick={saveAssignments}>{busy ? "Saving…" : "Save book assignments"}</PrimaryButton>
        </>}
      </div>}
    </Dialog>
    <Dialog open={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} title={`Delete ${deleting?.name || "category"}?`} appearance="light"
      footer={<><SecondaryButton disabled={busy} onClick={() => setDeleting(null)}>Cancel</SecondaryButton><PrimaryButton disabled={busy || (deleteMode !== "keep" && (!loaded || (deleteMode === "move" && !destination)))} onClick={confirmDelete}>{busy ? "Saving…" : "Delete category"}</PrimaryButton></>}>
      {deleting && <div className="studio-category-form">
        {feedback}
        <p>Books are never deleted. Child categories become top-level categories. Publish afterward to remove this category from the shop menu.</p>
        <p>{loaded ? `${books.filter(b => directlyAssigned(b, deleting)).length} directly assigned books.` : "Counts unavailable until the catalog loads."}</p>
        {books.filter(b => directlyAssigned(b, deleting)).length > 400 && <p>For more than 400 assigned books, use Edit → Assigned here to move or remove up to 400 per save before deleting.</p>}
        <SelectField label="What happens to assigned books?" value={deleteMode} disabled={busy || loading} onChange={e => setDeleteMode(e.target.value)}>
          <option value="keep">Keep their existing assignments (menu removal only)</option><option value="remove">Remove this category assignment</option><option value="move">Move them to another category</option>
        </SelectField>
        {deleteMode !== "keep" && <p>Book assignments change immediately in the live catalog. Discard Draft will not undo them.</p>}
        {deleteMode === "move" && <SelectField label="Move books to" value={destination} disabled={busy} onChange={e => setDestination(e.target.value)}><option value="">Choose a category</option>{cats.filter(c => c.id !== deleting.id && live.some(p => p.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>}
      </div>}
    </Dialog>
  </section>;
}
