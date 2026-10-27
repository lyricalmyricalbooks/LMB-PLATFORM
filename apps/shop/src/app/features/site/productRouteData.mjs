const titleSlug = (title = "") => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
/** Unique slugs stay readable; collisions use the immutable catalog ID. No writes. */
export function resolveProductRoutes(books) {
  const candidates = books.map(b => b.slug || titleSlug(b.title));
  const counts = new Map();
  candidates.forEach(s => counts.set(s, (counts.get(s) || 0) + 1));
  const ids = new Set(books.map(b => b.id));
  return books.map((book, index) => {
    const candidate = candidates[index];
    const safe = candidate && counts.get(candidate) === 1 && (!ids.has(candidate) || candidate === book.id);
    return { ...book, slug: safe ? candidate : book.id };
  });
}
