// Page layout › Book page / Collection page template (Studio 2.8): which layout is being edited (the default or an
// alternate), who uses it, and Create / Rename / Delete. Alternates: features/site/templateAlternates.ts.
import { Copy, Pencil, Trash2 } from "lucide-react";
import { ALT_BASE_LABELS, alternatesFor, altSurface, parseAltSurface, type AltBase } from "../../features/site/templateAlternates";

type Props = {
  design: any;
  /** The template being edited: "productPage", "collectionPage" or an alternate surface. */
  templateId: string;
  books: { slug: string; title: string; templateId?: string }[];
  previewBookSlug?: string;
  onSwitch: (templateId: string) => void;
  onPreviewBook: (slug: string) => void;
  onCreate: (base: AltBase, from: string) => void;
  onRename: (base: AltBase, id: string, name: string) => void;
  onDelete: (base: AltBase, id: string, name: string) => void;
};

export function templateBaseOf(templateId: string): AltBase | null {
  if (templateId === "productPage" || templateId === "collectionPage") return templateId;
  return parseAltSurface(templateId)?.base || null;
}

export function StudioTemplateCard(p: Props) {
  const base = templateBaseOf(p.templateId);
  if (!base) return null;
  const alt = parseAltSurface(p.templateId);
  const list = alternatesFor(p.design, base);
  const current = alt ? list.find(t => t.id === alt.id) : null;
  const kind = ALT_BASE_LABELS[base];
  const categories: any[] = (Array.isArray(p.design?.categories) ? p.design.categories : []).filter((c: any) => c && typeof c === "object");
  const users = base === "productPage"
    ? p.books.filter(b => (alt ? b.templateId === alt.id : b.templateId && list.some(t => t.id === b.templateId))).map(b => b.title)
    : categories.filter(c => (alt ? c.templateId === alt.id : c.templateId && list.some(t => t.id === c.templateId))).map(c => c.name);
  const noun = base === "productPage" ? "book" : "category";
  const assignHint = base === "productPage"
    ? "Choose a book's template in Books › edit › Categories & tags › Book page template."
    : "Choose a category's template in Navigation › Shop categories › Edit › Collection page template.";

  return (
    <div className="studio-template-card" data-studio-panel="template">
      <label className="studio-scheme-field">{kind} template
        <select value={p.templateId} onChange={e => p.onSwitch(e.target.value)} aria-label={`${kind} template to edit`}>
          <option value={base}>Default (every {noun} unless chosen otherwise)</option>
          {list.map(t => <option key={t.id} value={altSurface(base, t.id)}>{t.name}</option>)}
        </select>
      </label>
      <p className="studio-hint">
        {alt
          ? users.length ? `Used by ${users.length} ${noun}${users.length === 1 ? "" : "s"}: ${users.slice(0, 4).join(", ")}${users.length > 4 ? "…" : ""}.` : `No ${noun} uses this template yet.`
          : users.length ? `${users.length} ${noun}${users.length === 1 ? " uses" : "s use"} another template; every other ${noun} uses this one.` : `Every ${noun} uses this layout.`}
        {" "}{assignHint}
        {alt && base === "productPage" && " Its sections are its own; colours and fonts follow the default unless you set them for this page."}
        {alt && base === "collectionPage" && " It has its own sections; page styles follow the default collection page."}
      </p>
      {alt && base === "productPage" && p.books.length > 0 && (
        <label className="studio-scheme-field">Preview with
          <select value={p.previewBookSlug || ""} onChange={e => p.onPreviewBook(e.target.value)}>
            {p.books.map(b => <option key={b.slug} value={b.slug}>{b.title}</option>)}
          </select>
        </label>
      )}
      <div className="studio-scheme-actions">
        <button type="button" className="studio-link-button" onClick={() => p.onCreate(base, p.templateId)}><Copy size={13} aria-hidden /> New template from this one</button>
        {alt && current && <>
          <button type="button" className="studio-link-button" onClick={() => p.onRename(base, alt.id, current.name)}><Pencil size={13} aria-hidden /> Rename</button>
          <button type="button" className="studio-link-button" onClick={() => p.onDelete(base, alt.id, current.name)}><Trash2 size={13} aria-hidden /> Delete template</button>
        </>}
      </div>
    </div>
  );
}
