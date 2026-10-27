type Product = { id: string; slug?: string; title?: string; status?: string };
const titleSlug = (title = "") => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export { resolveProductRoutes } from "./productRouteData.mjs";
export function findProduct<T extends Product>(books: T[], slug: string | undefined, preview = false): T | undefined {
  if (!slug) return undefined;
  const visible = books.filter(b => preview || ((!b.status || b.status === "published")));
  const byId = visible.find(b => b.id === slug);
  if (byId) return byId;
  const exact = visible.filter(b => b.slug === slug);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const byTitle = visible.filter(b => titleSlug(b.title) === slug);
  return byTitle.length === 1 ? byTitle[0] : undefined;
}
