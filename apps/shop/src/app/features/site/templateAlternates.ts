// Alternate templates (Studio 2.8): extra layouts for book pages and collection pages ("Poetry", "Photo books"…).
// The list lives in the root-only `design.alternateTemplates` ({ productPage: [{ id, name }], collectionPage: [...] });
// each one's sections and page-only styles live on its own surface `productPage~<id>` / `collectionPage~<id>`, which
// layers over the default template (designModel.surfaceChain). A book picks one with `book.templateId`; a shop category
// with `category.templateId`. A missing or deleted template id simply means the default. Pure and storefront-safe.

export type AltBase = "productPage" | "collectionPage";
export type AlternateTemplate = { id: string; name: string };

export const ALT_BASES: AltBase[] = ["productPage", "collectionPage"];
export const ALT_BASE_LABELS: Record<AltBase, string> = { productPage: "Book page", collectionPage: "Collection page" };
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const altSurface = (base: AltBase, id: string) => `${base}~${id}`;

export function parseAltSurface(key: string): { base: AltBase; id: string } | null {
  const m = /^(productPage|collectionPage)~([a-z0-9][a-z0-9-]{0,39})$/.exec(String(key || ""));
  return m ? { base: m[1] as AltBase, id: m[2] } : null;
}
export const isAltSurface = (key: string) => parseAltSurface(key) !== null;

export function alternatesFor(design: any, base: AltBase): AlternateTemplate[] {
  const list = design?.alternateTemplates?.[base];
  return Array.isArray(list) ? list.filter(t => t && ID_RE.test(String(t.id)) && typeof t.name === "string") : [];
}

/** The template surface a book page uses: its chosen alternate when that still exists, else "productPage". */
export function bookTemplateSurface(design: any, book: any, override?: string | null): string {
  const id = override || book?.templateId;
  return id && alternatesFor(design, "productPage").some(t => t.id === id) ? altSurface("productPage", id) : "productPage";
}

/** The template surface a collection uses: its category's chosen alternate when that still exists. */
export function categoryTemplateSurface(design: any, category: any, override?: string | null): string {
  const id = override || (category && typeof category === "object" ? category.templateId : undefined);
  return id && alternatesFor(design, "collectionPage").some(t => t.id === id) ? altSurface("collectionPage", id) : "collectionPage";
}

/** Which surface holds the sections to show: an alternate without its own section list shows the default's. */
export function sectionsSurface(design: any, surface: string): string {
  const alt = parseAltSurface(surface);
  if (!alt) return surface;
  return Array.isArray(design?.[surface]?.sections) ? surface : alt.base;
}

const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "template";
const freshId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Adds an alternate called `name`, starting as a copy of `from` (the default or another alternate): its sections are
 * copied with new ids (section ids must stay unique across the design).
 */
export function createAlternate(design: any, base: AltBase, name: string, from: string = base): { design: any; id: string } {
  const clean = name.trim().slice(0, 60) || "New template";
  const taken = alternatesFor(design, base).map(t => t.id);
  let id = slug(clean), n = 2;
  while (taken.includes(id)) id = `${slug(clean).slice(0, 28)}-${n++}`;
  const source = design?.[from] && typeof design[from] === "object" ? JSON.parse(JSON.stringify(design[from])) : {};
  const sections = Array.isArray(source.sections) ? source.sections.map((s: any) => ({ ...s, id: freshId() })) : [];
  const registry = { ...(design?.alternateTemplates || {}), [base]: [...alternatesFor(design, base), { id, name: clean }] };
  // From the default: only its sections, so the alternate keeps following the default's page styles. From another
  // alternate: that one's own page styles come along too.
  const { sections: _drop, ...styles } = source;
  return { design: { ...design, alternateTemplates: registry, [altSurface(base, id)]: { ...(from === base ? {} : styles), sections } }, id };
}

export function renameAlternate(design: any, base: AltBase, id: string, name: string): any {
  const clean = name.trim().slice(0, 60);
  if (!clean) return design;
  const list = alternatesFor(design, base).map(t => (t.id === id ? { ...t, name: clean } : t));
  return { ...design, alternateTemplates: { ...(design?.alternateTemplates || {}), [base]: list } };
}

/** Removes an alternate and its surface. Books and categories still pointing at it show the default template. */
export function deleteAlternate(design: any, base: AltBase, id: string): any {
  const list = alternatesFor(design, base).filter(t => t.id !== id);
  const next = { ...design, alternateTemplates: { ...(design?.alternateTemplates || {}), [base]: list } };
  delete next[altSurface(base, id)];
  return next;
}

/** In the Studio preview, `?template=<id>` shows a page with that alternate (so it can be designed before any book uses it). */
export function previewTemplate(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("preview") === "true" ? params.get("template") : null;
}
