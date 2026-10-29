// What each kind of product ships as (plan 10.4, 29 October 2026): the words and tariff code on the customs form of an
// international parcel, and the weight counted for a copy whose weight nobody typed. A product's own answers (Details ›
// International parcels) always win; these are only what a blank box means. A product with no kind is a printed book,
// so a books shop's forms and weights are exactly as they were.
//
// The tariff codes are the common heading for each kind (HS 2022, checked October 2026), a starting point and not
// customs advice: the editor tells the owner to check the code for what they really ship. Weights are typical for one
// item in its parcel. "other" has no tariff code (Shippo accepts a form without one), so the owner enters theirs.
// Pure: the shop imports this file and the Functions run its generated copy (functions/shared/kindDefaults.js).

import { productKind, type ProductKind } from "./productOptions";

export type KindShipping = { description: string; hsCode: string; copyGrams: number };

const KIND_SHIPPING: Record<ProductKind, KindShipping> = {
  book: { description: "Printed books", hsCode: "4901.99", copyGrams: 680 },
  ebook: { description: "Printed books", hsCode: "4901.99", copyGrams: 680 },
  clothing: { description: "Clothing", hsCode: "6109.10", copyGrams: 300 },
  shoes: { description: "Footwear", hsCode: "6403.99", copyGrams: 900 },
  jewelry: { description: "Jewellery", hsCode: "7117.19", copyGrams: 50 },
  art: { description: "Art prints", hsCode: "4911.91", copyGrams: 250 },
  music: { description: "Music recordings", hsCode: "8523.49", copyGrams: 150 },
  other: { description: "Merchandise", hsCode: "", copyGrams: 500 },
};

/** The customs words, tariff code and fallback weight for a product's kind (a printed book when it has none). */
export function kindShipping(product: any): KindShipping {
  return KIND_SHIPPING[productKind(product)];
}
