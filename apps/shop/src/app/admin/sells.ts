// What a shop sells (plan 10.1, 28 October 2026): sign-up's "What do you sell?" answer (signup/form.js PUBLISHES,
// stored as `firstWeek/start` › `publishes`) shapes a new platform shop for what it sells.
//
// - A book answer (books, zines, comics, a mix), a skipped one or an unknown one changes nothing: today's words,
//   today's book fields, today's looks. That is the books-shop rule of plan 10.20.
// - Any other answer starts new products as that kind (the product editor's Product type) and, when the owner picks a
//   look (Choose your look, plan 6.3), puts starter words in the draft's Text & labels: "book" becomes "product" or
//   "item", "author" becomes "maker", the publishing-house blurbs become a plain shop's. Words the owner already
//   wrote are kept, and every starter word stays editable in Studio › Text & labels.
// Pure, so the welcome, the product editor and the tests share it.

import type { ProductKind } from "../../shared/productOptions";
import { DEFAULT_COPY } from "../features/site/storeCopy";
import { sellsBooks, wordsFor, type Sells } from "../../shared/shopSells";

// The answers and the books-shop rule live in src/shared/shopSells.ts, which the server's emails use too.
export { SELLS, sellsBooks } from "../../shared/shopSells";
export type { Sells } from "../../shared/shopSells";

/** The kind a new product starts as (the product editor's Product type). */
export function startingKind(answer?: string | null): ProductKind {
  if (sellsBooks(answer)) return "book";
  if (answer === "prints") return "art";
  return answer as Exclude<Sells, "books" | "zines" | "comics" | "mix" | "prints">;
}

/** Text & labels keys that only show for books (book details, e-books, formats), so they keep their book words. */
export const BOOK_ONLY_COPY = new Set([
  "specPublished", "specPublisher", "specIsbn", "filterFormat_paperback", "filterFormat_hardcover", "filterFormat_ebook",
  "accountEbook", "accountDigitalTitle", "accountDigitalText", "trackDigitalFormat",
]);

/** Starter words written out in full: the publishing-house blurbs and the short labels. */
const WRITTEN: Record<string, string> = {
  siteName: "Your Shop",
  siteDefaultTitle: "{name} — Independent shop",
  siteDefaultDescription: "{name} is an independent shop of carefully made things.",
  seoTopics: "",
  seoWishlistDescription: "Things you've saved for later from {name}.",
  seoBookLoadingTitle: "Product",
  seoCollectionDescription: "Browse the {category} collection from {name}.",
  cartBoxSetIncludes: "Includes {count} items",
  cartTabReminder: "({count}) Your picks are waiting",
  newsletterText: "New arrivals, limited runs and shop news — delivered quietly.",
  footerAbout: "An independent shop of carefully made things.",
  pdpAskToggle: "Ask a question about this product",
  bookNotFound: "Product not found",
  categoryFallback: "Product",
  catalogEmpty: "No products match these filters.",
  catalogShowMore: "Show more",
  historyBody: "{name} is an independent shop. We make and choose every piece with care, from the first idea to the parcel at your door.",
  historySubtext: "Independent, small-batch and made to last.",
  loadingSub: "Shop / new arrivals",
  ucTag: "Workshop is busy",
  ucFootnote: "{name} — made with care",
  secondaryNavigationAria: "Shop information",
  collectionIntroPublications: "Everything from {name} in one place.",
  collectionIntroBooks: "",
  collectionIntroZines: "",
  wishlistSharedNote: "Someone shared these picks with you",
  filterSearchPlaceholder: "Search by name, maker, category…",
  filterSortAria: "Sort products",
  filterBarAria: "Filter products",
  searchPlaceholder: "Products, makers, collections…",
  searchBooksLabel: "Products",
  searchArtistBooks: "{count} products",
  searchArtistBook: "1 product",
  searchNoResultsHint: "Check the spelling, or try a maker's name, a product name or a colour.",
  trackEmailPlaceholder: "e.g. you@example.com",
  accountSubtitle: "Sign in to track your orders and check out faster.",
  accountBookCountOne: "{count} item",
  accountBookCountMany: "{count} items",
  coAccountText: "Sign in with {email} to follow your delivery and check out faster next time.",
  coErrEmailFormat: "Check your email address — we send your receipt there.",
  coErrFieldEmail: "Enter your email address — we send your receipt there.",
  reviewsEmpty: "Be the first to share your thoughts on this product.",
};

/** Longer defaults where only a few words change: each pair must still match the default (the tests check). */
export const SWAPPED: Record<string, [string, string][]> = {
  trackPreorder: [["the last book", "the last item"]],
  trackPreorderTba: [["the book is out", "the item is out"]],
  trackReturn_inspected: [["Books inspected", "Items inspected"]],
  trackReqOpenReturn: [["send the books back", "send the items back"]],
  accountBuyAgainNone: [["Those books", "Those items"]],
  coShipMethodNote: [["these books", "these items"]],
  coFulfillmentTaxLocation: [["collected books", "collected items"]],
  coPreorderNotice: [["the last book", "the last item"]],
  coPreorderNoticeTba: [["the book is out", "the item is out"]],
  coBelowMinimum: [["another book", "another item"]],
  coHoldWarning: [["copies of one book", "of one item"], ["{count} copies of", "{count} of"]],
};

const swapped = (key: string) =>
  SWAPPED[key].reduce((text, [from, to]) => text.split(from).join(to), DEFAULT_COPY[key] || "");

/** The starter words for an answer, Text & labels key → words. Empty for a books shop. */
export function starterWords(answer?: string | null): Record<string, string> {
  if (sellsBooks(answer)) return {};
  const words: Record<string, string> = { ...WRITTEN };
  for (const key of Object.keys(SWAPPED)) words[key] = swapped(key);
  return words;
}

/** The design with the answer's starter words under the owner's own: a key the owner already set is kept. */
export function withStarterWords<T extends Record<string, any>>(design: T, answer?: string | null): T {
  const words = starterWords(answer);
  if (!Object.keys(words).length) return design;
  return { ...design, copy: { ...words, ...(design?.copy || {}) } };
}

/** The setup guide's first-product step, in the shop's words. */
export function firstProductWords(answer?: string | null): { title: string; why: string } | null {
  if (sellsBooks(answer)) return null;
  return { title: "Add your first product", why: "A name, a price and a photo are enough to start. Sizes, colours and the rest can come later." };
}

// Admin words (plan 10.23): `goodsWords` lives in src/shared/shopSells.ts, which the server's reports use too.
export { goodsWords } from "../../shared/shopSells";

/** The admin's word function for a sign-up answer: unchanged for a books shop. */
export const adminWordsFor = wordsFor;
