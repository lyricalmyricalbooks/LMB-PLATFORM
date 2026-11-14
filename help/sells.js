// What a shop sells, for the platform's own code (code plan 12.18, part 3): the sign-up answer to "What do you sell?"
// (signup/form.js PUBLISHES, kept as the shop's `publishes`, its profile's `sells` and, after the owner changes it in
// Settings, its `firstWeek/start.sells`). The same rule as the shop's apps/shop/src/shared/shopSells.ts, in plain JS so
// the platform's services, emails and pages can use it (sells.test.js keeps the two in step).
//
// A book answer (books, zines, comics, a mix), a skipped answer or one this version doesn't know is a books shop, and
// nothing changes for it.

/** The sign-up answers, in the form's order. */
export const SELLS = Object.freeze(["books", "zines", "comics", "prints", "mix", "mixed", "clothing", "shoes", "jewelry", "music", "other", "hair", "wellness", "lessons", "fitness", "studio", "services"]);
const BOOK_ANSWERS = new Set(["books", "zines", "comics", "mix"]);

/** True for a shop that sells books: a book answer, a skipped answer or one this version doesn't know. */
export function sellsBooks(answer) {
  return !answer || BOOK_ANSWERS.has(answer) || !SELLS.includes(answer);
}

// Service businesses (14 November 2026, Julian): a salon, a studio, a tutor or a therapist sells time, not things. Its
// answer is one of these (signup/form.js SERVICE_SELLS); the shop gives it Bookings, clients and payments for
// appointments in place of products, stock and shipping.
const SERVICE_ANSWERS = new Set(["hair", "wellness", "lessons", "fitness", "studio", "services"]);

/** True for a shop that sells services (appointments, classes, sessions) rather than products. */
export function sellsServices(answer) {
  return typeof answer === "string" && SERVICE_ANSWERS.has(answer);
}

/** The three kinds of shop: "books", "products" or "services". A skipped or unknown answer is a books shop. */
export function shopKind(answer) {
  return sellsBooks(answer) ? "books" : sellsServices(answer) ? "services" : "products";
}

/** The shop's current answer from whatever record is at hand: Settings first, then the sign-up answer. */
export function sellsOf(...records) {
  for (const r of records) {
    const answer = r?.sells || r?.publishes;
    if (typeof answer === "string" && answer) return answer;
  }
  return null;
}

// Book words → general words, the shop admin's swaps (shopSells.ts goodsWords) plus "press" → "shop" for the platform's
// own words to an owner ("your press's details"). Book-only words (e-book, ISBN, bookkeeping) are left alone.
const SWAPS = [
  [/\ban author\b/g, "a maker"], [/\bAn author\b/g, "A maker"],
  [/\bBook [Ff]airs\b/g, "Markets"], [/\bBook [Ff]air\b/g, "Market"], [/\bbook fairs\b/g, "markets"], [/\bbook fair\b/g, "market"],
  [/(?<![-\w])books\b/g, "products"], [/(?<![-\w])Books\b/g, "Products"], [/(?<![-\w])BOOKS\b/g, "PRODUCTS"],
  [/(?<![-\w])book\b/g, "product"], [/(?<![-\w])Book\b/g, "Product"], [/(?<![-\w])BOOK\b/g, "PRODUCT"],
  [/\bauthors\b/g, "makers"], [/\bAuthors\b/g, "Makers"], [/\bauthor\b/g, "maker"], [/\bAuthor\b/g, "Maker"],
  [/\bcopies\b/g, "items"], [/\bCopies\b/g, "Items"],
  [/(?<!(?:page|SEO|search|tab|meta) )\btitles\b/g, "products"], [/(?<!(?:Page|SEO|Search|Tab|Meta) )\bTitles\b/g, "Products"],
  [/\ba title\b/g, "a product"], [/\bA title\b/g, "A product"],
  [/(?<![Ss]creen )\breaders\b/g, "shoppers"], [/(?<![Ss]creen )\breader\b/g, "shopper"], [/\bReaders\b/g, "Shoppers"], [/\bReader\b/g, "Shopper"],
  [/\beditions\b/g, "options"], [/\bpresses\b/g, "shops"], [/\bpress's\b/g, "shop's"], [/\bPress's\b/g, "Shop's"],
  [/\byour press\b/g, "your shop"], [/\bYour press\b/g, "Your shop"], [/\bthe press\b/g, "the shop"], [/\bThe press\b/g, "The shop"],
];

/** Words for a shop that isn't books: book → product, author → maker, press → shop, copies → items. */
export function goodsWords(text) {
  return SWAPS.reduce((out, [from, to]) => out.replace(from, to), String(text));
}

// A services shop's words, laid over the general ones: it has services and clients, not products and shoppers.
const SERVICE_SWAPS = [
  [/\bproducts\b/g, "services"], [/\bProducts\b/g, "Services"], [/\bPRODUCTS\b/g, "SERVICES"],
  [/\ba product\b/g, "a service"], [/\bA product\b/g, "A service"],
  [/\bproduct\b/g, "service"], [/\bProduct\b/g, "Service"], [/\bPRODUCT\b/g, "SERVICE"],
  [/\bshoppers\b/g, "clients"], [/\bShoppers\b/g, "Clients"], [/\bshopper\b/g, "client"], [/\bShopper\b/g, "Client"],
  [/\bcustomers\b/g, "clients"], [/\bCustomers\b/g, "Clients"], [/\bcustomer\b/g, "client"], [/\bCustomer\b/g, "Client"],
];

/** Words for a shop that sells services: the general words, then product → service and customer → client. */
export function servicesWords(text) {
  return SERVICE_SWAPS.reduce((out, [from, to]) => out.replace(from, to), goodsWords(text));
}

const same = (text) => text;

/** The word function for an answer: unchanged for a books shop. */
export function wordsFor(answer) {
  return sellsBooks(answer) ? same : sellsServices(answer) ? servicesWords : goodsWords;
}

/**
 * What the payment account says the shop sells (Stripe's `business_profile`): a merchant category and a short
 * description. Stripe uses them to review the account and, on these accounts, they can only be set when it is made, so
 * a clothing shop must not be filed as a book shop. Codes from Stripe's list of merchant categories.
 */
const MERCHANT = {
  books: { mcc: "5942", description: "Books and printed matter" },
  mixed: { mcc: "5942", description: "Books, printed matter and other goods" },
  prints: { mcc: "5971", description: "Art prints and artworks" },
  clothing: { mcc: "5651", description: "Clothing" },
  shoes: { mcc: "5661", description: "Shoes" },
  jewelry: { mcc: "5944", description: "Jewellery" },
  music: { mcc: "5735", description: "Music and records" },
  other: { mcc: "5999", description: "Handmade and specialty goods" },
  hair: { mcc: "7230", description: "Hair and beauty services" },
  wellness: { mcc: "8099", description: "Health and wellness services" },
  lessons: { mcc: "8299", description: "Lessons and tutoring" },
  fitness: { mcc: "7997", description: "Fitness classes and training" },
  studio: { mcc: "7299", description: "Studio and creative services" },
  services: { mcc: "7299", description: "Personal services by appointment" },
};

/** The merchant category and description for an answer; every books answer is a book shop. */
export function merchantProfile(answer) {
  if (sellsBooks(answer)) return { ...MERCHANT.books };
  return { ...(MERCHANT[answer] || MERCHANT.other) };
}
