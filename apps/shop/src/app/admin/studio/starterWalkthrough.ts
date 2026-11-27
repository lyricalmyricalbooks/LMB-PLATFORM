// What a starter needs, beyond its design and sample products, to be walked through like a finished shop: its own pages
// (About, Shipping, Contact) published, its sample shelves in the menu, its made-up brand's name, its sample services and
// team for Book a time, and a sample shipping rule for the bag. The live demo shops and Online store › Preview both use it,
// so a preview is never missing a page the demo has.
import { starterPagesToAdd } from "./starterDesign";
import { starterBookingSamples } from "./starterPages";

/** The starter's own pages, published, so the header and footer show the links a finished shop has. */
export function starterSamplePages(shop: any): any[] {
  return starterPagesToAdd(shop, []).map((page: any, i: number) => ({ ...page, id: `demo-${page.slug}`, status: "published", order: i }));
}

/** The sample products' shelves as menu categories (a finished shop has them in Studio › Menus › Shop categories). */
export function starterShelves(books: any[]): any[] {
  const names = [...new Set(books.flatMap((b: any) => b.categories || []).filter((c: string) => c && c !== "Featured"))];
  return names.map((name, i) => ({ id: `demo-cat-${i + 1}`, name, description: "", showInNav: true }));
}

/**
 * The sample shipping rule a sample shop's bag reads (plan "Starters on par", step 5): free shipping over about twice a
 * typical sample product, rounded, so one item shows how far away free shipping is and two usually reach it. A shop with
 * nothing to ship has no rule, so its bag shows no bar.
 */
export function sampleShipping(books: any[]): any[] {
  const prices = books.map((b: any) => Number(b.retailPrice ?? b.price) || 0).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return [];
  const typical = prices[Math.floor(prices.length / 2)];
  const step = typical >= 100 ? 100 : typical >= 25 ? 25 : 5;
  return [{ id: "demo-shipping", name: "Standard shipping", freeShippingOver: Math.ceil((typical * 2) / step) * step }];
}

export { starterBookingSamples };
