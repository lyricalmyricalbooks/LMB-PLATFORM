// Adding products round 3 (plan https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL): the product list's "Needs
// attention" filter. A live product is listed when shoppers can see it but something is wrong: no photo, no weight to
// work out shipping, nothing left to sell, or a fact the law asks for (a safety warning, ingredients) left blank.
// Pure, so the list and its test agree.
import { isBundle, isGiftCardProduct } from "../features/site/promotions";
import { typeOfProduct } from "../../shared/productTypes";
import { missingLawFacts } from "./typeFacts";
import type { StockInfo } from "./catalogList";

const DIGITAL_FORMATS = ["E-book (PDF)", "E-book (EPUB)", "Audiobook"];

function hasWeight(book: any): boolean {
  const filled = (v: unknown) => String(v ?? "").trim() !== "" && Number.parseFloat(String(v)) > 0;
  const variants = Array.isArray(book?.variants) ? book.variants.filter(Boolean) : [];
  if (variants.length) return variants.every((v: any) => filled(v.weight) || filled(book.weight));
  return filled(book?.weight);
}

/** What a live product is missing, in a few plain words each ("No photo", "Sold out"). Empty when it's fine. */
export function attentionReasons(book: any, stock: StockInfo, live: boolean): string[] {
  if (!live || !book) return [];
  const reasons: string[] = [];
  if (!(book.photoUrl || (Array.isArray(book.photos) && book.photos.length))) reasons.push("No photo");
  const giftCard = isGiftCardProduct(book);
  const type = typeOfProduct(book);
  const parcel = !giftCard && !isBundle(book) && book.digital !== true && !DIGITAL_FORMATS.includes(book.format) && !type?.traits.noParcel;
  if (parcel && !hasWeight(book)) reasons.push("No weight");
  if (stock.kind === "soldout") reasons.push("Sold out");
  if (!giftCard) for (const fact of missingLawFacts(book, type)) reasons.push(`No ${fact.label.toLowerCase()}`);
  return reasons;
}
