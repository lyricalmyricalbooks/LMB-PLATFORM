// Save and add another (product types plan, change 11, 18 November 2026). Once a new product is saved, the next one can
// start from it: "Add another candle" keeps the type, maker, price, sizes, shipping and categories; "Add a new colour"
// copies everything (words, facts, sizes) and leaves out the colour, the photos and anything that names one product
// only (web address, item code, barcode). Pure, so it is tested without the editor.
import { variantsForOptions, type ProductOption } from "../../shared/productOptions";

const isColour = (name: unknown) => /^colou?rs?$/i.test(String(name ?? "").trim());

/** Whether a product has a colour choice, so "Add a new colour" makes sense. */
export function hasColourChoice(product: any): boolean {
  return (Array.isArray(product?.options) ? product.options : []).some((o: any) => isColour(o?.name) && (o.values || []).length);
}

const KEEP_FOR_ANOTHER = [
  "typeId", "typeName", "kind", "format", "googleCategory", "productType", "subtitle", "publisher",
  "retailPrice", "usdPrice", "eurPrice", "wholesalePrice", "weight", "weightUnit", "dimensions", "shippingProfileId",
  "madeToOrderTime", "categories", "trackInventory", "allowBackorder", "customsDescription", "hsTariffNumber",
  "countryOfOrigin", "digital", "taxCode",
] as const;

/** Never carried to another product: what makes this one itself. */
const NEVER = ["id", "slug", "sku", "isbn", "barcode", "gtin", "photos", "photoUrl", "videos", "createdAt", "updatedAt",
  "publishedAt", "status", "stockLevel", "stock", "legacyId", "inventoryKey", "seoTitle", "metaDescription", "reviews",
  "rating", "shopOrder", "isFeatured", "featured", "scheduleDate"];

function freshVariants(options: ProductOption[], from: any): any[] {
  const price = Number(from?.retailPrice) || 0;
  const like = (Array.isArray(from?.variants) ? from.variants : [])[0] || {};
  const { variants } = variantsForOptions(options, [], () => ({
    id: crypto.randomUUID(), price, usdPrice: like.usdPrice ?? 0, eurPrice: like.eurPrice ?? 0,
    stock: 0, stockLevel: 0, photoUrl: "", sku: "", weight: from?.weight || "",
  }));
  return variants;
}

/**
 * What the next product starts with. `another`: the same kind of thing (type, maker, price, sizes, shipping, the safety
 * line). `colour`: the same product in a new colour (everything but the colour, photos and one-product codes).
 */
export function nextProductStart(saved: any, mode: "another" | "colour"): Record<string, any> {
  const copy = JSON.parse(JSON.stringify(saved ?? {}));
  const options: ProductOption[] = (Array.isArray(copy.options) ? copy.options : []).filter((o: any) => o && o.name);
  if (mode === "another") {
    const start: Record<string, any> = {};
    for (const key of KEEP_FOR_ANOTHER) if (copy[key] !== undefined) start[key] = copy[key];
    // The safety line belongs to the type (every candle has it); the other facts belong to this product.
    const safety = (Array.isArray(copy.detailRows) ? copy.detailRows : []).filter((r: any) => r?.key === "fact:safety");
    if (safety.length) start.detailRows = safety;
    // Sizes carry over; colours and other choices are this product's own.
    const sizes = options.filter((o) => /^sizes?$/i.test(o.name.trim()));
    if (sizes.length) { start.options = sizes; start.variants = freshVariants(sizes, copy); }
    return start;
  }
  for (const key of NEVER) delete copy[key];
  const rest = options.filter((o) => !isColour(o.name));
  copy.options = rest;
  copy.variants = rest.length ? freshVariants(rest, copy) : [];
  return copy;
}
