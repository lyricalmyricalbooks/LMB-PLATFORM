// Options for Studio's single "Page to edit" picker: every page type, each shop category,
// each book and each custom page, so choosing what to preview is one step.

export type PickerOption = {
  id: string; label: string; group: string; hint?: string;
  templateId: string; global?: boolean; productSlug?: string; collectionSlug?: string;
};

const PAGE_ORDER = ["heroPage", "storefront", "cartPage", "wishlistPage", "accountPage", "trackingPage", "page404"];

export function pickerOptions(input: {
  templates: { id: string; label: string; pageSlug?: string }[];
  books: { slug: string; title: string }[];
  collections: { slug: string; label: string }[];
}): PickerOption[] {
  const byId = new Map(input.templates.map(t => [t.id, t]));
  const out: PickerOption[] = [];
  for (const id of PAGE_ORDER) {
    const t = byId.get(id);
    if (t) out.push({ id: `t:${id}`, label: t.label, group: "Store pages", templateId: id });
  }
  for (const c of input.collections) out.push({ id: `c:${c.slug}`, label: c.label, group: "Collections", hint: "Collection page", templateId: "collectionPage", collectionSlug: c.slug });
  for (const b of input.books) out.push({ id: `b:${b.slug}`, label: b.title, group: "Book pages", hint: "Book page", templateId: "productPage", productSlug: b.slug });
  if (!input.books.length && byId.has("productPage")) out.push({ id: "t:productPage", label: "Book page (add a published book to preview it)", group: "Book pages", templateId: "productPage" });
  // Alternate templates (Studio 2.8): "productPage~poetry" / "collectionPage~photo-books".
  for (const t of input.templates) {
    const base = t.id.split("~")[0];
    if (!t.id.includes("~") || (base !== "productPage" && base !== "collectionPage")) continue;
    out.push({ id: `t:${t.id}`, label: t.label, group: base === "productPage" ? "Book pages" : "Collections", hint: "Template", templateId: t.id });
  }
  if (byId.has("page")) out.push({ id: "t:page", label: "All custom pages (shared layout)", group: "Custom pages", templateId: "page" });
  for (const t of input.templates) if (t.pageSlug) out.push({ id: `t:${t.id}`, label: t.label, group: "Custom pages", templateId: t.id });
  out.push({ id: "global", label: "Header & footer sections (every page)", group: "Every page", templateId: "", global: true });
  return out;
}

/** Every typed word must appear in the label, group or hint. */
export function filterOptions(options: PickerOption[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter(o => {
    const hay = `${o.label} ${o.group} ${o.hint || ""}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/** The option describing what Studio shows right now. */
export function currentOption(options: PickerOption[], state: { templateId: string; showGlobal: boolean; productSlug?: string; collectionSlug?: string }) {
  if (state.showGlobal) return options.find(o => o.global);
  if (state.templateId === "productPage") return options.find(o => o.productSlug === state.productSlug);
  if (state.templateId === "collectionPage") return options.find(o => o.collectionSlug === state.collectionSlug);
  return options.find(o => o.templateId === state.templateId && !o.productSlug && !o.collectionSlug);
}
