import { parseWeightGrams } from "../features/site/shippingEngine";
import { isPlaceholderCatalogRecord } from "../features/site/catalogQuality.mjs";
import { isDigitalItem } from "./fulfillment";
export type CatalogIssue = { key: string; message: string; blocking: boolean };
export function catalogPublishIssues(book: any): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const flag = (key: string, condition: boolean, message: string, blocking = false) => { if (condition) issues.push({ key, message, blocking }); };
  const blank = (value: any) => !String(value ?? "").trim();
  // Gift cards are amounts, not books: no credits, edition details, weight or interior photos.
  // Box sets ship the books inside, whose weights stand in when the set has none of its own.
  const giftCard = book.productType === "giftCard";
  const boxSet = Array.isArray(book.bundleItems) && book.bundleItems.some((p: any) => p && p.bookId);
  const priceInvalid = (value: any) => value === "" || value == null || !Number.isFinite(Number(value)) || Number(value) < 0;
  flag("title", blank(book.title), "Add a title.", true);
  flag("photos", !(book.photos || []).some((photo: any) => /^https?:\/\//.test(String(photo.url || ""))), "Add a genuine cover photo and interior images.");
  flag("interior", !giftCard && (book.photos || []).filter((photo: any) => /^https?:\/\//.test(String(photo.url || ""))).length === 1, "Add genuine interior photos for shoppers to preview.");
  flag("credits", !giftCard && blank(book.subtitle) && blank(book.authorName), "Add confirmed author or contributor credits.");
  flag("price", (!giftCard && priceInvalid(book.retailPrice)) || (book.isOnSale && priceInvalid(book.salePrice)) || (book.variants || []).some((variant: any) => priceInvalid(variant.price)), "Fix missing, negative or invalid book/edition prices.", true);
  flag("free", (!priceInvalid(book.retailPrice) && Number(book.retailPrice) === 0 && !(book.variants || []).length)
    || (book.variants || []).some((variant: any) => !priceInvalid(variant.price) && Number(variant.price) === 0), "Confirm this book or edition is intentionally free.");
  flag("giftcard-amounts", giftCard && !(book.variants || []).some((variant: any) => Number(variant?.price) > 0), "Add at least one gift card amount above $0.", true);
  flag("edition", !giftCard && !boxSet && (blank(book.format) || blank(book.edition) || !(Number(book.pageCount) > 0)), "Complete format, edition/printing and page count.");
  // E-books and audiobooks (by flag or format, the same test fulfilment uses) need no weight;
  // a book sold in editions needs it on each physical edition (or as the book's default).
  const digitalBook = isDigitalItem(book);
  const heavy = (value: any) => Number(parseWeightGrams(value)) > 0;
  const editions = Array.isArray(book.variants) ? book.variants : [];
  const weightMissing = editions.length
    ? !digitalBook && editions.some((variant: any) => !isDigitalItem({ ...variant, format: variant.format || variant.name }) && !heavy(variant.weight || book.weight))
    : !digitalBook && !heavy(book.weight);
  flag("weight", !giftCard && !boxSet && weightMissing, "Add positive shipping weight for physical editions.");
  flag("description", blank(book.description), "Add publisher copy explaining the book.");
  flag("placeholder", isPlaceholderCatalogRecord(book) || /lorem ipsum|placeholder|coming soon|sample description/i.test(String(book.description || "")), "Review possible test, duplicate or placeholder content. Titles alone never hide a published book.");
  return issues;
}
