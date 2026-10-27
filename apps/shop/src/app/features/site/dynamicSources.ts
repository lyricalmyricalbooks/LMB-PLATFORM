// Dynamic sources (Studio 2.7): a section or block field can be connected to a detail of the page it is on instead of
// fixed text — the book on a book page, the open category, the custom page. A connected value is saved as
// `{ "$dyn": "book.custom.series" }`; text can also hold tokens like "Book {{book.custom.series_number}} of the series".
// `resolveDynamicSettings` turns them into plain values before a renderer sees them, so renderers stay unchanged.
// Pure and storefront-safe.
import type { BookFieldDef } from "./bookFields";
import { slugify } from "./storeMenu";
import { descriptionPlainText } from "./descriptionLinks";

export type DynamicContext = { book?: any; category?: any; page?: any };
export type DynamicSource = { path: string; label: string; group: "Book" | "Category" | "Page"; kind: "text" | "image" | "link" };

export const BUILT_IN_SOURCES: DynamicSource[] = [
  { path: "book.title", label: "Title", group: "Book", kind: "text" },
  { path: "book.subtitle", label: "Subtitle", group: "Book", kind: "text" },
  { path: "book.authorName", label: "Author", group: "Book", kind: "text" },
  { path: "book.description", label: "Description (plain text)", group: "Book", kind: "text" },
  { path: "book.publisher", label: "Publisher", group: "Book", kind: "text" },
  { path: "book.publishDate", label: "Publication date", group: "Book", kind: "text" },
  { path: "book.pageCount", label: "Page count", group: "Book", kind: "text" },
  { path: "book.format", label: "Format", group: "Book", kind: "text" },
  { path: "book.edition", label: "Edition", group: "Book", kind: "text" },
  { path: "book.isbn", label: "ISBN", group: "Book", kind: "text" },
  { path: "book.photo", label: "First photo", group: "Book", kind: "image" },
  { path: "book.url", label: "Book page link", group: "Book", kind: "link" },
  { path: "category.name", label: "Name", group: "Category", kind: "text" },
  { path: "category.description", label: "Description", group: "Category", kind: "text" },
  { path: "category.image", label: "Picture", group: "Category", kind: "image" },
  { path: "category.url", label: "Collection link", group: "Category", kind: "link" },
  { path: "page.title", label: "Title", group: "Page", kind: "text" },
];

/** Built-in sources plus one per custom book field. */
export function dynamicSources(fields: BookFieldDef[] = []): DynamicSource[] {
  const custom = fields.map(f => ({
    path: `book.custom.${f.key}`, label: f.label, group: "Book" as const,
    kind: f.kind === "image" ? "image" as const : f.kind === "url" ? "link" as const : "text" as const,
  }));
  return [...BUILT_IN_SOURCES, ...custom];
}

/** "Book › Series" for a path, using the custom field labels when known. */
export function sourceLabel(path: string, fields: BookFieldDef[] = []): string {
  const hit = dynamicSources(fields).find(s => s.path === path);
  if (hit) return `${hit.group} › ${hit.label}`;
  const [group, ...rest] = path.split(".");
  return `${group.charAt(0).toUpperCase()}${group.slice(1)} › ${rest[rest.length - 1] || path}`;
}

export const isDynamic = (v: any): v is { $dyn: string } => !!v && typeof v === "object" && !Array.isArray(v) && typeof v.$dyn === "string";
/** A field value as text for Studio lists and labels: a connected value reads "‹Book › Series›". */
export const displayValue = (v: any): any => (isDynamic(v) ? `‹${sourceLabel(v.$dyn)}›` : v);
export const connect = (path: string) => ({ $dyn: path });

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const str = (v: any) => (v === undefined || v === null ? "" : String(v));

/** The value of one source on this page ("" when the page has no such detail). */
export function readSource(path: string, ctx: DynamicContext): string {
  const [group, key, sub] = path.split(".");
  if (group === "book") {
    const b = ctx.book;
    if (!b) return "";
    if (key === "custom") return sub ? str(b.custom?.[sub]) : "";
    if (key === "description") return plain(descriptionPlainText(str(b.description)));
    if (key === "photo") return str(b.photos?.[0]?.url);
    if (key === "url") return b.slug || b.id ? `/books/${b.slug || b.id}` : "";
    return ["title", "subtitle", "authorName", "publisher", "publishDate", "pageCount", "format", "edition", "isbn"].includes(key) ? str(b[key]) : "";
  }
  if (group === "category") {
    const c = ctx.category;
    if (!c) return "";
    const name = typeof c === "string" ? c : str(c.name);
    if (key === "name") return name;
    if (key === "url") return name ? `/collections/${slugify(name)}` : "";
    if (key === "description") return typeof c === "string" ? "" : str(c.description);
    if (key === "image") return typeof c === "string" ? "" : str(c.image || c.imageUrl);
    return "";
  }
  if (group === "page") return key === "title" ? str(ctx.page?.title) : "";
  return "";
}

const TOKEN = /\{\{\s*([a-zA-Z]+(?:\.[a-zA-Z0-9_]+){1,2})\s*\}\}/g;
export const hasTokens = (v: any) => typeof v === "string" && v.includes("{{") && /\{\{\s*[a-zA-Z]+\./.test(v);

type Tally = { used: number; missing: number };
type Options = { preview?: boolean; fields?: BookFieldDef[]; htmlKeys?: readonly string[] };

/**
 * Setting names a section draws as HTML (dangerouslySetInnerHTML), by section type. A value connected to such a
 * field is catalogue text, not markup: it is escaped on the way in so a title like "Fear & <Loathing>" shows as
 * written instead of breaking or injecting the surrounding markup. Every other field is plain text that
 * React escapes itself. `dynamicSources.test.ts` fails when SectionComponents gains an HTML field not listed here.
 */
export const HTML_SETTING_KEYS: Record<string, readonly string[]> = {
  RichTextSection: ["html"],
  CustomHTMLSection: ["html"],
  CollapsibleSection: ["content"],
  TextContentSection: ["content"],
};

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" } as Record<string, string>)[c]);
const looksLikeHtml = (text: string) => /<[a-z!/][^>]*>/i.test(text);

/** A whole-field connection into an HTML field: plain unless it has angle brackets, then escaped inside a paragraph. */
const htmlSafeValue = (value: string) => (/[<>]/.test(value) ? `<p>${escapeHtml(value)}</p>` : value);

function resolveValue(v: any, ctx: DynamicContext, tally: Tally, opts: Options, html = false): any {
  if (isDynamic(v)) {
    tally.used++;
    const value = readSource(v.$dyn, ctx);
    if (value) return html ? htmlSafeValue(value) : value;
    tally.missing++;
    // In the Studio preview an unfilled connection shows its name, so the owner can see where it goes.
    return opts.preview ? `‹${sourceLabel(v.$dyn, opts.fields)}›` : "";
  }
  if (hasTokens(v)) {
    const markup = html && looksLikeHtml(v as string);
    let needsParagraph = false;
    const out = (v as string).replace(TOKEN, (_m, path) => {
      tally.used++;
      const value = readSource(path, ctx);
      if (!value) { tally.missing++; return opts.preview ? `‹${sourceLabel(path, opts.fields)}›` : ""; }
      if (!html) return value;
      if (markup) return escapeHtml(value);
      if (/[<>]/.test(value)) { needsParagraph = true; return escapeHtml(value); }
      return value;
    });
    return needsParagraph ? `<p>${out}</p>` : out;
  }
  if (Array.isArray(v)) {
    let changed = false;
    const next = v.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const r = resolveObject(item, ctx, tally, opts);
      if (r !== item) changed = true;
      return r;
    });
    return changed ? next : v;
  }
  return v;
}

function resolveObject(obj: any, ctx: DynamicContext, tally: Tally, opts: Options): any {
  let next = obj;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("__")) continue;
    const r = resolveValue(v, ctx, tally, opts, !!opts.htmlKeys?.includes(k));
    if (r !== v) { if (next === obj) next = { ...obj }; next[k] = r; }
  }
  return next;
}

/**
 * Plain settings for a renderer, plus whether the section should hide: with "Hide when empty" on, a section whose
 * connected details are missing on this page is left out (never in the Studio preview, which shows placeholders).
 */
export function resolveDynamicSettings(settings: any, ctx: DynamicContext, opts: Options = {}): { settings: any; hidden: boolean; used: number; missing: number } {
  if (!settings || typeof settings !== "object") return { settings, hidden: false, used: 0, missing: 0 };
  const tally: Tally = { used: 0, missing: 0 };
  const resolved = resolveObject(settings, ctx, tally, opts);
  const hidden = !opts.preview && settings.hideWhenEmpty === true && tally.used > 0 && tally.missing > 0;
  return { settings: resolved, hidden, ...tally };
}
