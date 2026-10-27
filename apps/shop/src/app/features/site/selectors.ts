import { releaseArrived } from "./liveBook";
import { placeholderImage } from "./constants";
import type { Book } from "./types";
import { bookInCategory } from "./navItems";

const LOGO_DESIGN_FIELDS = [
  "logoUrl", "logoText", "logoColor", "logoHoverColor", "logoTint", "logoHeight",
  // Two-part wordmark support (LogoMark renders these when wordmarkStyle is "two-part")
  "wordmarkStyle", "wordmarkPrimary", "wordmarkSecondary", "wordmarkSize", "wordmarkWeight", "wordmarkSecondaryMuted", "wordmarkSecondaryColor", "headingFont", "wordmarkFont",
] as const;

function firstConfiguredValue(field: (typeof LOGO_DESIGN_FIELDS)[number], designs: any[]) {
  return designs.find((design) => design?.[field] != null)?.[field];
}

export function resolveLogoDesign(surfaceDesign: any, fallbackDesigns: any[] = []) {
  const resolvedDesign = { ...(surfaceDesign || {}) };

  for (const field of LOGO_DESIGN_FIELDS) {
    const value = firstConfiguredValue(field, [surfaceDesign, ...fallbackDesigns]);
    if (value != null) resolvedDesign[field] = value;
  }

  return resolvedDesign;
}

export function resolveLogoPosition(surfaceDesign: any, fallbackDesigns: any[] = []) {
  return [surfaceDesign, ...fallbackDesigns].find((design) => design?.logoPosition != null)?.logoPosition || "left";
}

export function getFeaturedBooks(books: Book[]) {
  const featuredBooks = books.filter((book) => book.status === "published" && (book.isFeatured ?? book.featured) === true).slice(0, 4);
  // Nothing starred as featured → show the first eligible published books rather than invented ones.
  return featuredBooks.length > 0 ? featuredBooks : books.filter((book) => book.status === "published").slice(0, 4);
}

export function getPublications(books: Book[], design?: any) {
  return books.map((book) => ({
    title: book.title.toUpperCase(),
    image: book.photos?.[0]?.url || placeholderImage(design),
  }));
}

export function getFilteredItems(books: Book[], activeCategory: any, nowISO: string, allCategories: any[] = []) {
  return books.filter(
    (book) =>
      book.status === "published" &&
      releaseArrived(book.scheduleDate, nowISO) &&
      bookInCategory(book, activeCategory, allCategories),
  );
}

export function getPublishedBooks(books: Book[]) {
  return books.filter((book) => book.status === "published");
}
