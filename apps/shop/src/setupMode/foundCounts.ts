// What reading an old shop found (design "Shop setup (bento)", screen 4): the four counts on the Bring your shop tile.
// Pure, from the preview the shop's own importer made, so the counts are what would be kept.
import type { MovePlan } from "../app/admin/shopMove";
import type { ImportPlan } from "../app/admin/catalogImport";

export interface FoundCounts { products: number; photos: number; inStock: number; oldLinks: number }

const stockOf = (patch: Record<string, any>): number => {
  const editions = Array.isArray(patch.variants) ? patch.variants : [];
  if (editions.length) return editions.reduce((sum: number, e: any) => sum + (Number(e?.stock ?? e?.stockLevel) || 0), 0);
  return Number(patch.stockLevel) || 0;
};

/** Products that would come in, their photos, how many have stock, and the old addresses that will keep working. */
export function foundCounts(plan: ImportPlan, oldPaths: MovePlan["oldPaths"]): FoundCounts {
  const coming = plan.problems.length ? [] : plan.rows.filter((r) => r.action === "create");
  return {
    products: coming.length,
    photos: coming.reduce((sum, r) => sum + (Array.isArray(r.patch.photos) ? r.patch.photos.length : 0), 0),
    inStock: coming.filter((r) => stockOf(r.patch) > 0).length,
    oldLinks: coming.reduce((sum, r) => sum + new Set(oldPaths.get(r.line) ?? []).size, 0),
  };
}
