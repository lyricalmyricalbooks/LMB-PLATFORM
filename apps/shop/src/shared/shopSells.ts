// What a shop sells (plans 10.1 and 10.23), in one place for the shop and the server: sign-up's "What do you sell?"
// answer (signup/form.js PUBLISHES, stored as `firstWeek/start` › `publishes`, and in the shop profile as `sells`).
//
// A book answer (books, zines, comics, a mix), a skipped answer or one this version doesn't know is a books shop, and
// nothing changes for it. Any other answer gets the words below in its customer emails: "your order" and "items"
// instead of "your book" and "reading". The admin's Settings › Notifications shows the same defaults, and every word
// stays editable there.

/** The sign-up answers (signup/form.js PUBLISHES.options), in the form's order. */
export const SELLS = ["books", "zines", "comics", "prints", "mix", "clothing", "shoes", "jewelry", "music", "other"] as const;
export type Sells = (typeof SELLS)[number];

/** The answers that keep a books shop exactly as it is. */
const BOOK_ANSWERS = new Set<string>(["books", "zines", "comics", "mix"]);

/** True for a shop that sells books: a book answer, a skipped answer or one this version doesn't know. */
export function sellsBooks(answer?: string | null): boolean {
  return !answer || BOOK_ANSWERS.has(answer) || !(SELLS as readonly string[]).includes(answer);
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
];

/** Words for a shop or product that isn't books: book → product, author → maker. */
export function goodsWords(text: string): string {
  return GOODS_SWAPS.reduce((out, [from, to]) => out.replace(from, to), text);
}

const same = (text: string) => text;

/** The word function for a sign-up answer: unchanged for a books shop. */
export function wordsFor(answer?: string | null): (text: string) => string {
  return sellsBooks(answer) ? same : goodsWords;
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
