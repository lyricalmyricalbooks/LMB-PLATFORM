// Studio pickers (2.3): the choices behind the link / book / books / category / page / video /
// font fields of the section and block editors. Pure and tested (pickers.test.ts).
//
// Every picker saves exactly the string that field held before pickers existed, so saved designs
// need no migration and keep rendering the same:
//   link     → a site-relative href ("/page/about", "/collections/zines", "/books/<slug>") or a typed URL;
//              SectionComponents' siteHref adds the GitHub Pages sub-path, so hrefs never include it.
//   book     → the book's storefront slug (what /books/<slug> and the renderers match).
//   books    → those slugs, comma-separated (the old "Manual product slugs" text).
//   category → the shop category's name (design.categories).
//   page     → the custom page's slug.
//   video    → the video URL; font → the Google Fonts family name.

import { resolveProductRoutes } from "../../features/site/productRoutes";
import { isLiveBook } from "../../features/site/liveBook";
import { slugify } from "../../features/site/storeMenu";
import { normalizeCategories, parentOf } from "../../features/site/categoryMembership.mjs";
import { FONT_CHOICES } from "../../features/site/fonts";

export type PickOption = { id: string; value: string; label: string; group: string; hint?: string };

/** Store pages every shop has, as the storefront router spells them. */
export const FIXED_LINKS: { value: string; label: string; hint?: string }[] = [
  { value: "/", label: "Home" },
  { value: "/?catalog=true", label: "Shop — all books", hint: "The catalog" },
  { value: "/wishlist", label: "Wishlist" },
  { value: "/account", label: "Customer account" },
  { value: "/track", label: "Order tracking" },
];

/**
 * The value a book picker saves: resolveProductRoutes over the whole catalog Studio loaded, so a
 * slug any two books share (even one not on sale yet) is saved as the book's immutable id from the
 * start. The Studio preview resolves the same complete snapshot, and a scheduled twin going live
 * later can't make a saved pick switch books. selectBooks/pickBook match a saved value by slug or id.
 */
export function bookSlugs(books: any[]): Map<string, string> {
  const list = (books || []).filter((b) => b && b.id);
  const all = new Map(resolveProductRoutes(list).map((b: any) => [b.id, b.slug]));
  return new Map(list.map((b) => [b.id, all.get(b.id) || b.id]));
}

export function bookOptions(books: any[], now = new Date().toISOString()): PickOption[] {
  const slugs = bookSlugs(books);
  return (books || []).filter((b) => b && b.id).map((b) => {
    const live = isLiveBook(b, now);
    const author = typeof b.author === "string" ? b.author : "";
    return {
      id: `book:${b.id}`, value: slugs.get(b.id) || b.id, label: b.title || slugs.get(b.id) || b.id, group: "Books",
      hint: live ? author || undefined : "Not on sale yet",
    };
  });
}

/** Shop categories (design.categories), sub-categories labelled "Parent › Child". The value is the name. */
export function categoryOptions(categories: any[]): PickOption[] {
  const all = normalizeCategories(categories || []);
  return all.filter((c: any) => c.name).map((c: any) => {
    const parentId = parentOf(c, all);
    const parent = parentId ? all.find((p: any) => p.id === parentId) : null;
    return {
      id: `cat:${c.id}`, value: c.name, label: parent ? `${parent.name} › ${c.name}` : c.name, group: "Shop categories",
      hint: c.showInNav === false ? "Hidden from the menu" : undefined,
    };
  });
}

/** Custom pages (Studio › Pages), published first. The value is the slug. */
export function pageOptions(pages: any[]): PickOption[] {
  const list = (pages || []).filter((p) => p && p.slug);
  const published = list.filter((p) => p.status === "published");
  const drafts = list.filter((p) => p.status !== "published");
  return [...published, ...drafts].map((p) => ({
    id: `page:${p.id || p.slug}`, value: p.slug, label: p.title || p.slug, group: "Custom pages",
    hint: p.status === "published" ? undefined : "Draft — shoppers can't open it yet",
  }));
}

/** Every place a link field can point inside the shop, as the hrefs the storefront already reads. */
export function linkOptions(data: { books?: any[]; pages?: any[]; categories?: any[] }, now?: string): PickOption[] {
  return [
    ...FIXED_LINKS.map((f) => ({ id: `fixed:${f.value}`, value: f.value, label: f.label, group: "Store pages", hint: f.hint })),
    ...pageOptions(data.pages || []).map((o) => ({ ...o, value: `/page/${o.value}` })),
    ...categoryOptions(data.categories || []).map((o) => ({ ...o, value: `/collections/${slugify(o.value)}` })),
    ...bookOptions(data.books || [], now).map((o) => ({ ...o, value: `/books/${o.value}` })),
  ];
}

/** Plain-English summary of a saved link ("Custom page · About", "Web address", …). */
export function describeLink(href: string | undefined | null, options: PickOption[]): { label: string; group: string } | null {
  const value = String(href || "").trim();
  if (!value) return null;
  const found = options.find((o) => o.value === value);
  if (found) return { label: found.label, group: found.group };
  if (/^https?:\/\//i.test(value)) return { label: value.replace(/^https?:\/\//i, ""), group: "Web address (opens another site)" };
  if (/^mailto:/i.test(value)) return { label: value.slice(7), group: "Email link" };
  if (/^tel:/i.test(value)) return { label: value.slice(4), group: "Phone link" };
  if (value.startsWith("#")) return { label: value, group: "Spot on this page" };
  if (value.startsWith("/")) return { label: value, group: "Link inside the shop (not matched to a page)" };
  return { label: value, group: "Custom link" };
}

/** Every typed word must appear in the label, group or hint (same rule as the Page to edit picker). */
export function filterPickOptions(options: PickOption[], query: string): PickOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => {
    const hay = `${o.label} ${o.group} ${o.hint || ""} ${o.value}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export type VideoKind = "empty" | "youtube" | "vimeo" | "file" | "unknown";

/**
 * What the storefront's video sections will make of a URL. Mirrors the renderers' own matching
 * (VideoSection, VideoHeroSection, Row video blocks), so the owner learns before publishing
 * whether a link will actually play.
 */
export function describeVideo(url: string | undefined | null): { kind: VideoKind; text: string } {
  const value = String(url || "").trim();
  if (!value) return { kind: "empty", text: "Paste a YouTube, Vimeo or .mp4 link." };
  if (/youtube\.com|youtu\.be/.test(value)) {
    return /(?:v=|youtu\.be\/)([\w-]{6,})/.test(value)
      ? { kind: "youtube", text: "YouTube video — ready to play." }
      : { kind: "unknown", text: "This YouTube link won't play here. Use the video's Share link (youtu.be/…) or its watch?v= address." };
  }
  if (/vimeo\.com/.test(value)) {
    return /vimeo\.com\/(\d+)/.test(value)
      ? { kind: "vimeo", text: "Vimeo video — ready to play." }
      : { kind: "unknown", text: "This Vimeo link won't play here. Use the address with the video's number (vimeo.com/123456)." };
  }
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(value)) return { kind: "file", text: "Video file — plays in the browser's own player." };
  return { kind: "unknown", text: "Not recognised as a video. Paste a YouTube, Vimeo or .mp4 link." };
}

/** Font choices: the curated Google Fonts list, plus a saved name that isn't on it (kept, never lost). */
export function fontOptions(current?: string): { value: string; label: string }[] {
  const list = FONT_CHOICES.map((f) => ({ value: f.name, label: f.note ? `${f.name} — ${f.note}` : f.name }));
  const value = String(current || "").trim();
  return value && !list.some((o) => o.value === value) ? [{ value, label: `${value} (typed name)` }, ...list] : list;
}
