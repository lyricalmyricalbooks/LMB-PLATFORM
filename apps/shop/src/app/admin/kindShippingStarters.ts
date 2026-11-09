// What a new shop's shipping starts as, for what it sells (plan 12.14 follow-up, 3 November 2026): the starter prices
// for the Canada / United States / rest-of-world zones, and the parcel sizes that show in Buy a label. A shirt, a ring
// and a pair of shoes don't cost the same to send, so a clothing shop shouldn't begin with book prices. These are
// starting points the owner edits. A books shop (and a mix, which starts as books) gets exactly the old prices and no
// parcel sizes, so nothing about a books shop changes. Pure.
import { startingKind } from "./sells";
import type { ProductKind } from "../../shared/productOptions";

type ZonePrices = { ca: [number, number]; us: [number, number]; world: [number, number] };

/** First item and each extra item, per zone. The books row is the original starter. */
const PRICES: Record<ProductKind, ZonePrices> = {
  book: { ca: [8, 3], us: [12, 4], world: [20, 6] },
  ebook: { ca: [8, 3], us: [12, 4], world: [20, 6] },
  clothing: { ca: [9, 4], us: [13, 5], world: [22, 8] },
  shoes: { ca: [14, 8], us: [20, 10], world: [35, 15] },
  jewelry: { ca: [6, 1], us: [8, 1], world: [14, 2] },
  art: { ca: [9, 3], us: [13, 4], world: [22, 6] },
  music: { ca: [7, 2], us: [10, 3], world: [18, 4] },
  other: { ca: [9, 4], us: [13, 5], world: [22, 8] },
};

/** The starter's zone prices for what the shop sells: books when there is no answer or a book answer. */
export function kindStarterPrices(sells?: string | null): ZonePrices {
  return PRICES[startingKind(sells)] ?? PRICES.book;
}

export type StarterParcel = { name: string; parcel: { length: string; width: string; height: string; weight: string; distance_unit: string; mass_unit: string } };

const box = (name: string, length: number, width: number, height: number): StarterParcel => ({
  name, parcel: { length: String(length), width: String(width), height: String(height), weight: "", distance_unit: "in", mass_unit: "g" },
});

const PARCELS: Partial<Record<ProductKind, StarterParcel[]>> = {
  clothing: [box("Small mailer", 12, 9, 2), box("Large mailer", 14, 10, 3)],
  shoes: [box("Shoe box", 14, 10, 6)],
  jewelry: [box("Small box", 6, 4, 1), box("Padded mailer", 8, 6, 1)],
  art: [box("Flat mailer", 16, 12, 1), box("Large flat mailer", 20, 16, 1)],
  music: [box("Record mailer", 13, 13, 1), box("Small box", 8, 6, 2)],
  other: [box("Small box", 10, 8, 4), box("Medium box", 14, 12, 6)],
};

/** Box sizes for Buy a label, or none for a books shop (it types its own as before). */
export function kindStarterParcels(sells?: string | null): StarterParcel[] {
  return PARCELS[startingKind(sells)] ?? [];
}
