// What a shop sells (plans 10.1 and 10.23), in one place for the shop and the server: sign-up's "What do you sell?"
// answer (signup/form.js PUBLISHES, stored as `firstWeek/start` › `publishes`, and in the shop profile as `sells`).
//
// A book answer (books, zines, comics, a mix), a skipped answer or one this version doesn't know is a books shop, and
// nothing changes for it. Any other answer gets the words below in its customer emails: "your order" and "items"
// instead of "your book" and "reading". The admin's Settings › Notifications shows the same defaults, and every word
// stays editable there.

/** The sign-up answers (signup/form.js PUBLISHES.options), in the form's order. */
export const SELLS = ["books", "zines", "comics", "prints", "mix", "mixed", "clothing", "shoes", "jewelry", "music", "other", "hair", "wellness", "lessons", "fitness", "studio", "services"] as const;
export type Sells = (typeof SELLS)[number];

/** The answers that keep a books shop exactly as it is. */
const BOOK_ANSWERS = new Set<string>(["books", "zines", "comics", "mix"]);

/** True for a shop that sells books: a book answer, a skipped answer or one this version doesn't know. */
export function sellsBooks(answer?: string | null): boolean {
  return !answer || BOOK_ANSWERS.has(answer) || !(SELLS as readonly string[]).includes(answer);
}

// Service businesses (14 November 2026, Julian): a salon, a studio, a tutor or a therapist sells time, not things. Its
// answer is one of these (signup/form.js SERVICE_SELLS). The admin gives it the calendar, clients and payments for
// appointments in place of products, stock and shipping (riso/nav.ts SERVICES_WEBSITE_SIDE).
const SERVICE_ANSWERS = new Set<string>(["hair", "wellness", "lessons", "fitness", "studio", "services"]);

/** True for a shop that sells services (appointments, classes, sessions) rather than products. */
export function sellsServices(answer?: string | null): boolean {
  return typeof answer === "string" && SERVICE_ANSWERS.has(answer);
}

/**
 * A books shop's starting menu (features/site/constants.ts CATEGORIES), and the one it had before 14 November 2026
 * (LEGACY_CATEGORIES). A shop that doesn't sell books and still has one of them untouched shows no categories: the
 * storefront (admin/sells.ts withShopStartFor) and the published pages (scripts/sitemapData.mjs) must agree, or the
 * page drawing waits for a collection page the shop never shows.
 */
export const STARTING_BOOK_MENUS = [["PUBLICATIONS", "ZINES", "IMPRINT", "OUT OF PRINT"], ["PUBLICATIONS", "EPHEMERA", "IMPRINT", "OUT OF PRINT"]] as const;

/** True when `categories` is a books shop's untouched starting menu and the shop doesn't sell books. */
export function unusedBookMenu(categories: unknown, answer?: string | null): boolean {
  if (!answer || sellsBooks(answer) || !Array.isArray(categories)) return false;
  return STARTING_BOOK_MENUS.some((menu) => categories.length === menu.length && categories.every((name, i) => name === menu[i]));
}

/** The three kinds of shop: a skipped or unknown answer is a books shop. */
export type ShopKind = "books" | "products" | "services";
export function shopKind(answer?: string | null): ShopKind {
  return sellsBooks(answer) ? "books" : sellsServices(answer) ? "services" : "products";
}

// Words (plan 10.23): the shop is written for books. For a shop that sells something else, the words people see pass
// through `goodsWords` ("Add book" → "Add product", "author" → "maker"). Book-only words (e-book, ISBN, publisher,
// bookkeeping) are left alone.
const GOODS_SWAPS: [RegExp, string][] = [
  [/\ban author\b/g, "a maker"], [/\bAn author\b/g, "A maker"],
  [/\bBook [Ff]airs\b/g, "Markets"], [/\bBook [Ff]air\b/g, "Market"], [/\bbook fairs\b/g, "markets"], [/\bbook fair\b/g, "market"],
  [/(?<![-\w])books\b/g, "products"], [/(?<![-\w])Books\b/g, "Products"], [/(?<![-\w])BOOKS\b/g, "PRODUCTS"],
  [/(?<![-\w])book\b/g, "product"], [/(?<![-\w])Book\b/g, "Product"], [/(?<![-\w])BOOK\b/g, "PRODUCT"],
  [/\bauthors\b/g, "makers"], [/\bAuthors\b/g, "Makers"], [/\bauthor\b/g, "maker"], [/\bAuthor\b/g, "Maker"],
  // Counting words (4 November 2026): "copies", "titles" and "readers" are a book shop's words for items, products and
  // shoppers. "copy" alone stays ("Copy the link"), and so do screen readers and page or SEO titles.
  [/\bcopies\b/g, "items"], [/\bCopies\b/g, "Items"],
  [/(?<!(?:page|SEO|search|tab|meta) )\btitles\b/g, "products"], [/(?<!(?:Page|SEO|Search|Tab|Meta) )\bTitles\b/g, "Products"],
  // Variants (11 November 2026): a book's "editions" are a product's variants (one per size, colour or both).
  [/\ban edition\b/g, "a variant"], [/\bAn edition\b/g, "A variant"],
  [/\beditions\b/g, "variants"], [/\bEditions\b/g, "Variants"], [/\bedition\b/g, "variant"], [/\bEdition\b/g, "Variant"],
  [/(?<![Ss]creen )\breaders\b/g, "shoppers"], [/(?<![Ss]creen )\breader\b/g, "shopper"], [/\bReaders\b/g, "Shoppers"], [/\bReader\b/g, "Shopper"],
];

/** Words for a shop or product that isn't books: book → product, author → maker. */
export function goodsWords(text: string): string {
  return GOODS_SWAPS.reduce((out, [from, to]) => out.replace(from, to), text);
}

// A services shop has clients, not customers or shoppers. "Product" stays: a services shop that also sells a few
// products (Settings › What you sell) still has a Products page, and its services are named by Bookings itself.
const CLIENT_SWAPS: [RegExp, string][] = [
  [/\bshoppers\b/g, "clients"], [/\bShoppers\b/g, "Clients"], [/\bshopper\b/g, "client"], [/\bShopper\b/g, "Client"],
  [/\bcustomers\b/g, "clients"], [/\bCustomers\b/g, "Clients"], [/\bCUSTOMERS\b/g, "CLIENTS"],
  [/\bcustomer's\b/g, "client's"], [/\bcustomer\b/g, "client"], [/\bCustomer\b/g, "Client"],
];

// "Book" is also what a services shop's clients do ("ready to book", "Book a time"). That verb keeps its word: it is
// marked before the swaps and unmarked after, so only the thing a shop sells is reworded.
const BOOK_VERB = [
  [/\b(to|can|can't|cannot|could|they|clients|people|you|who|may|will|must) (b)(ook)\b/gi, "$1 $2\u0000$3"],
  [/\b(b)(ook) (a time|an appointment|online|again|in|themselves|now|ahead)\b/gi, "$1\u0000$2 $3"],
] as [RegExp, string][];
const keepBookVerb = (text: string) => BOOK_VERB.reduce((out, [from, to]) => out.replace(from, to), text);

/** Words for a services shop: the general words, then customer → client. */
export function servicesWords(text: string): string {
  return CLIENT_SWAPS.reduce((out, [from, to]) => out.replace(from, to), goodsWords(keepBookVerb(text))).replaceAll("\u0000", "");
}

const same = (text: string) => text;

/** The word function for a sign-up answer: unchanged for a books shop. */
export function wordsFor(answer?: string | null): (text: string) => string {
  return sellsBooks(answer) ? same : sellsServices(answer) ? servicesWords : goodsWords;
}

type EmailWords = { subject?: string; body?: string; buttonText?: string; signoff?: string };
const FIELDS = ["subject", "body", "buttonText", "signoff"] as const;

/** A shop that doesn't sell books: the default words that differ from a books shop's, per email. */
export const GOODS_EMAILS: Record<string, EmailWords> = {
  customer_welcome: {
    body: "Hi {{customer_name}},\n\nThank you for creating an account with {{shop_name}}! You can now log in to view your orders, save shipping addresses, and download your digital purchases.",
  },
  gift_card: { signoff: "Enjoy,\nThe {{shop_name}} team" },
  review_request: {
    subject: "How are you finding your order?",
    body: "Hi {{customer_name}},\n\nWe hope your order {{order_id}} arrived safely. If you have a moment, we'd love to hear what you think — a short review helps other shoppers choose. Each item below opens its page, where the review form is.",
    signoff: "Thanks,\nThe {{shop_name}} team",
  },
};

/** The order confirmation's note above the download buttons, for a shop that doesn't sell books. */
export function goodsDownloadNote(limit: number): string {
  return `Use the buttons below to download your digital files. Each file can be downloaded up to ${limit} times from this email; if you need more, reply to this email. You can also download from your account or the order tracking page at any time.`;
}

/** This shop's email defaults: the books shop's, with GOODS_EMAILS laid over them for a shop that doesn't sell books. */
export function emailDefaultsFor<T extends Record<string, any>>(answer: string | null | undefined, bookDefaults: T): T {
  if (sellsBooks(answer)) return bookDefaults;
  const out: Record<string, any> = { ...bookDefaults };
  for (const [id, words] of Object.entries(GOODS_EMAILS)) if (out[id]) out[id] = { ...out[id], ...words };
  return out as T;
}

/**
 * Saved email settings in this shop's words. A saved field that still holds the books shop's default (the editor saves
 * every field, so an untouched one was saved too) reads as this shop's default; words the owner changed are kept.
 * A books shop's settings come back unchanged.
 */
export function withShopEmailWords<T extends Record<string, any>>(answer: string | null | undefined, settings: T, bookDefaults: Record<string, any>): T {
  if (sellsBooks(answer)) return settings;
  const out: Record<string, any> = { ...settings };
  for (const [id, words] of Object.entries(GOODS_EMAILS)) {
    const saved = out[id];
    if (!saved || typeof saved !== "object") continue;
    const next = { ...saved };
    for (const field of FIELDS) {
      if (words[field] !== undefined && next[field] === bookDefaults[id]?.[field]) next[field] = words[field];
    }
    out[id] = next;
  }
  return out as T;
}

// Web addresses (plan 12.18, 4 November 2026): a product's page is /books/<slug> in a books shop and /products/<slug>
// in any other. Both addresses open every product page in every shop, so links shared before a change keep working.

/** Every first part a product's web address may have. */
export const PRODUCT_BASES = ["books", "products"] as const;
export type ProductBase = (typeof PRODUCT_BASES)[number];

/** The first part of this shop's product addresses: "books" for a books shop, "products" for any other. */
export function productBase(answer?: string | null): ProductBase {
  return sellsBooks(answer) ? "books" : "products";
}

/** Publisher-only stockroom parts (artist shares, copies an author holds, author money): shops that sell books, mixed ones too. */
export function hasPublisherTools(answer?: string | null): boolean {
  return sellsBooks(answer) || answer === "mixed";
}
