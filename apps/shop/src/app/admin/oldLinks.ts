// Settings › General › URL redirects › Check your old links (plan 23.8). The shop's server reads the old shop's site
// map (functions/oldShopRead.js); this tries each old address on the new shop the way the shop's own routes would
// (App.tsx: /books/:slug, /page/:slug, /collections/:slug, then the redirect list for anything else) and, for each one
// that would land on "page not found", suggests where to send it. Pure and tested; nothing is saved here.
import { findRedirect, normalizePath, type Redirect } from "../features/site/redirects";
import { findProduct } from "../features/site/productRoutes";
import { resolveProductRoutes } from "../features/site/productRouteData.mjs";
import { categoryNames, normalizeCategories } from "../features/site/categoryMembership.mjs";
import { policyPageFor } from "../features/site/policyPages";
import { slugify } from "../features/site/storeMenu";

/** works: a page of the new shop answers. redirected: a saved redirect sends it on. draft: its page isn't published yet. */
export type OldLinkState = "works" | "redirected" | "draft" | "missing";

export interface OldLink {
  path: string;
  state: OldLinkState;
  /** Where a saved redirect sends it (redirected), or the draft's page (draft). */
  to?: string;
  /** For a missing one: the best place to send it, in words the owner reads. */
  suggestion?: { to: string; label: string };
}

export interface NewShop {
  books: any[];
  pages: { slug?: string; title?: string; status?: string }[];
  settings: any;
  redirects: Redirect[];
}

/** The shop's own routes that always answer. */
const FIXED = /^\/(cart|wishlist|account|checkout|track)(\/|$)/;
/** Old addresses that listed the whole shop: they go to every book. */
const LISTING = /^\/(products?|shop|store|catalog|catalogue|collections?|categor(y|ies)|product-category|product-tag|tags?|search)(\/|$)/;
const POLICIES: [RegExp, string][] = [[/shipping|delivery/, "shipping"], [/return|refund/, "returns"], [/privacy/, "privacy"], [/terms|conditions/, "terms"], [/accessib/, "accessibility"]];

const lastSegment = (path: string) => slugify((path.split("/").filter(Boolean).pop() || "").replace(/\.(html?|php|aspx?)$/i, ""));
/** Same words, or one inside the other ("about-us" and "about"), for words of four letters or more. */
const near = (a: string, b: string) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))));

export function checkOldLinks(paths: string[], shop: NewShop): OldLink[] {
  const books = resolveProductRoutes((shop.books || []).filter((b: any) => b && b.id));
  const pages = (shop.pages || []).filter((p) => p?.slug);
  const policies = shop.settings?.policies;
  const design = shop.settings?.design || {};
  const categorySource = design.categories ?? design.storefront?.categories ?? design.heroPage?.categories ?? [];
  const categories = normalizeCategories(Array.isArray(categorySource) ? categorySource : []);
  const categorySlugs = categories.flatMap((c: any) => categoryNames(c).map((n: string) => slugify(n))).filter(Boolean);
  const seen = new Set<string>();
  const out: OldLink[] = [];

  const suggest = (path: string): { to: string; label: string } => {
    const word = lastSegment(path);
    const book = books.find((b: any) => b.slug === word) || books.find((b: any) => near(word, b.slug) || near(word, slugify(b.title || "")));
    if (book) return { to: `/books/${book.slug}`, label: book.title || book.slug };
    const page = pages.find((p) => p.slug === word) || pages.find((p) => near(word, String(p.slug)) || near(word, slugify(p.title || "")));
    if (page) return { to: `/page/${page.slug}`, label: page.title || String(page.slug) };
    const policy = POLICIES.find(([re, key]) => re.test(word) && policyPageFor(`policy-${key}`, policies, design));
    if (policy) { const p = policyPageFor(`policy-${policy[1]}`, policies, design)!; return { to: `/page/${p.slug}`, label: p.title }; }
    const category = categorySlugs.find((s: string) => near(word, s));
    if (category) return { to: `/collections/${category}`, label: `The ${category.replace(/-/g, " ")} collection` };
    if (LISTING.test(path)) return { to: "/collections/all", label: "All your books" };
    return { to: "/", label: "Your home page" };
  };

  for (const raw of paths) {
    const path = normalizePath(raw);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (path === "/" || FIXED.test(path) || /^\/collections\/[^/]+$/.test(path)) { out.push({ path, state: "works" }); continue; }
    const [, kind, slug] = /^\/(books|page)\/([^/]+)$/.exec(path) || [];
    if (kind === "books") {
      const book = findProduct(books, slug, true);
      if (book) { out.push(book.status && book.status !== "published" ? { path, state: "draft", to: `/books/${book.slug}` } : { path, state: "works" }); continue; }
    }
    if (kind === "page") {
      const page = pages.find((p) => p.slug === slug);
      if (page || policyPageFor(slug, policies, design)) { out.push(page && page.status !== "published" ? { path, state: "draft", to: path } : { path, state: "works" }); continue; }
    }
    const to = findRedirect(shop.redirects, path);
    out.push(to ? { path, state: "redirected", to } : { path, state: "missing", suggestion: suggest(path) });
  }
  return out;
}

/** How many of each, for the summary line. */
export function countLinks(links: OldLink[]): Record<OldLinkState, number> {
  const n: Record<OldLinkState, number> = { works: 0, redirected: 0, draft: 0, missing: 0 };
  for (const l of links) n[l.state] += 1;
  return n;
}

/** One of the old shop's own pages as the server read it (functions/moving/oldPages.mjs): its body already rebuilt safely. */
export interface OldPage { path: string; slug: string; title: string; body: string; images: number }

/**
 * Bring pages over (plan 23.6): the draft pages to create and the redirects from their old addresses. A page whose
 * address word is already one of this shop's pages is left alone (so bringing the same pages twice adds nothing), and
 * an address word the shop keeps for its policies gets "old-" in front.
 */
export function pagesToSave(pages: OldPage[], existing: { slug?: string; order?: number }[]) {
  const taken = new Set(existing.map((p) => p.slug).filter(Boolean));
  let order = Math.max(0, ...existing.map((p) => Number(p.order) || 0));
  const create: { title: string; slug: string; body: string; status: "draft"; showInNav: false; order: number }[] = [];
  const redirects: Redirect[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let photos = 0;
  for (const page of pages) {
    const slug = /^policy-/.test(page.slug) ? `old-${page.slug}` : page.slug;
    if (!slug) { skipped.push({ path: page.path, reason: "has no address we could use" }); continue; }
    if (taken.has(slug)) { skipped.push({ path: page.path, reason: `is already here as /page/${slug}` }); continue; }
    taken.add(slug);
    order += 1;
    create.push({ title: page.title.slice(0, 200) || slug, slug, body: page.body, status: "draft", showInNav: false, order });
    if (normalizePath(page.path) !== `/page/${slug}`) redirects.push({ from: page.path, to: `/page/${slug}` });
    photos += Number(page.images) || 0;
  }
  return { create, redirects, skipped, photos };
}
