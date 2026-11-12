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
import { CATEGORIES } from "../features/site/constants";
import { DEFAULT_SHOP_NAME, shopName } from "../../shared/shopIdentity";
import { DEFAULT_ANNOUNCEMENT, DEFAULT_SHOP_DESCRIPTION } from "./defaultSettings";
import { sellsBooks, wordsFor, type Sells } from "../../shared/shopSells";

// The answers and the books-shop rule live in src/shared/shopSells.ts, which the server's emails use too.
export { SELLS, sellsBooks } from "../../shared/shopSells";
export type { Sells } from "../../shared/shopSells";

/** What the shop sells now: the owner's own choice in Settings (`sells`) first, else the sign-up answer (`publishes`). */
export function currentSells(doc?: { sells?: string | null; publishes?: string | null } | null): string | null {
  return doc?.sells || doc?.publishes || null;
}

/** The kind a new product starts as (the product editor's Product type). */
export function startingKind(answer?: string | null): ProductKind {
  if (sellsBooks(answer)) return "book";
  if (answer === "prints") return "art";
  // A shop of books and other things starts a new product as a book; the owner picks another kind per product.
  if (answer === "mixed") return "book";
  return answer as Exclude<Sells, "books" | "zines" | "comics" | "mix" | "mixed" | "prints">;
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
  // Counting and choosing words (4 November 2026): copies, titles and editions are a book shop's.
  pdpInBagOne: "1 already in your bag",
  pdpInBagMany: "{count} already in your bag",
  pdpQuoteToggle: "Ordering many? Ask for a quote",
  pdpQuoteQuantity: "How many",
  pdpQuoteInvalid: "Please add your name, a valid email and how many you need.",
  pdpAddOnsTotal: "With extras: {price} each",
  bookFormatLabel: "Option",
  pdpEditionChoose: "Choose an option",
  pdpEditionMissing: "Please choose an option first.",
  productDescriptionLabel: "ABOUT THIS PRODUCT",
  specEdition: "Option",
  trackAddEdition: "Option",
  catalogCountOne: "{count} product",
  catalogCountMany: "{count} products",
  searchNoBooks: "No products match.",
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
  coHoldLimit: [["as many copies set aside", "as many items set aside"]],
  coHoldWarningUnits: [["{count} copies in total", "{count} items in total"], ["{limit} copies at a time", "{limit} items at a time"]],
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

/**
 * The design shoppers read, in the words of what the shop sells now (settings/website `sells`, which the server copies
 * from Settings › What you sell and the sign-up answer). A shop that sells something else gets the starter words under
 * its own; a shop that sells books again drops the starter words an earlier answer left (they are ours, not the
 * owner's: a word the owner changed is kept). No answer (an older shop the server hasn't copied yet) changes nothing.
 */
export function withShopWordsFor<T extends Record<string, any> | null | undefined>(design: T, answer?: string | null): T {
  if (!design || !answer) return design;
  if (!sellsBooks(answer)) return withStarterWords(design as Record<string, any>, answer) as T;
  const copy = (design as Record<string, any>).copy;
  if (!copy || typeof copy !== "object") return design;
  const goods = starterWords("other");
  const kept = Object.fromEntries(Object.entries(copy).filter(([key, text]) => !(key in goods && text === goods[key])));
  return Object.keys(kept).length === Object.keys(copy).length ? design : { ...design, copy: kept } as T;
}

/** The banner a shop that doesn't sell books starts with, until its owner writes one (Studio › Style › Announcement bar). */
export const GOODS_ANNOUNCEMENT = "AN INDEPENDENT SHOP OF CAREFULLY MADE THINGS";

const BOOK_HERO_SUBTITLE = "PHOTOGRAPHY & ART BOOKS";

const typedName = (value: unknown): string => {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name !== DEFAULT_SHOP_NAME ? name : "";
};
const sameList = (a: unknown, b: readonly string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The settings shoppers read, before the owner has changed the starting words (12 November 2026).
 * - Every shop: an unset site name is the Store name from Settings, else the name given at sign-up (`shopName` in
 *   settings/website, else the profile's), instead of the placeholder. The server's emails already did this (`pressName`).
 * - A shop that doesn't sell books: the starter words (`withShopWordsFor`), and the publishing-house banner, description
 *   and category menu are swapped for a plain shop's while they still equal the book defaults. Anything the owner typed
 *   is kept, and the stored settings are never changed.
 */
export function withShopStartFor<T extends Record<string, any>>(settings: T, signupName?: string | null): T {
  if (!settings) return settings;
  const sells = (settings as any).sells as string | undefined;
  const baseDesign: Record<string, any> = settings.design || {};
  const given = typedName(baseDesign.copy?.siteName) ? "" : typedName(settings.info?.name) || typedName(settings.shopName) || typedName(signupName);
  const named = given ? { ...baseDesign, copy: { ...(baseDesign.copy || {}), siteName: given } } : baseDesign;
  let design: Record<string, any> = withShopWordsFor(named, sells);
  // The starting hero slide is titled with the placeholder name: it follows the shop's name until the owner retitles it.
  const goods = Boolean(sells) && !sellsBooks(sells);
  const slides = design.hero?.slides;
  if (Array.isArray(slides) && slides.some((s: any) => s?.title === DEFAULT_SHOP_NAME || (goods && s?.subtitle === BOOK_HERO_SUBTITLE))) {
    design = { ...design, hero: { ...design.hero, slides: slides.map((s: any) => ({
      ...s,
      ...(s?.title === DEFAULT_SHOP_NAME ? { title: shopName(design) } : {}),
      ...(goods && s?.subtitle === BOOK_HERO_SUBTITLE ? { subtitle: "NEW ARRIVALS" } : {}),
    })) } };
  }
  const out: Record<string, any> = { ...settings };
  if (settings.info && !typedName(settings.info.name)) out.info = { ...settings.info, name: shopName(design) };
  if (goods) {
    if (design.announcementText === DEFAULT_ANNOUNCEMENT) design = { ...design, announcementText: GOODS_ANNOUNCEMENT };
    if (sameList(design.categories, CATEGORIES)) design = { ...design, categories: [] };
    if (Array.isArray(settings.announcements) && settings.announcements[0]?.message === DEFAULT_ANNOUNCEMENT) {
      out.announcements = [{ ...settings.announcements[0], message: GOODS_ANNOUNCEMENT }, ...settings.announcements.slice(1)];
    }
    if (out.info?.description === DEFAULT_SHOP_DESCRIPTION) {
      out.info = { ...out.info, description: WRITTEN.siteDefaultDescription.replace("{name}", shopName(design)) };
    }
  }
  if (design !== baseDesign) out.design = design;
  return out as T;
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
