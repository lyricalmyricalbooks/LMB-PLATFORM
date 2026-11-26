// What the sign-up page asks and how its answers are checked. Plain ES module with no imports, so the page loads it as
// is and the server checks the same rules (signup.js). Words here are customer-facing: never name a rival.

/** The one question, and it can be skipped. The answer shapes the first-week checklist later (plan item 3.3). */
export const QUESTION = Object.freeze({
  id: "sellingToday",
  label: "How do you sell today?",
  hint: "Optional. It helps us show you the right first steps.",
  options: Object.freeze([
    Object.freeze({ id: "starting", label: "I'm just starting out" }),
    Object.freeze({ id: "fairs", label: "At fairs and markets" }),
    Object.freeze({ id: "online", label: "Through another online shop" }),
    Object.freeze({ id: "shops", label: "Through bookshops and distributors" }),
    Object.freeze({ id: "spreadsheet", label: "I keep track in a spreadsheet" }),
  ]),
});

/** Countries a press can sign up from for now, and the currency its shop starts in (changeable later in the shop). */
export const COUNTRIES = Object.freeze({
  CA: Object.freeze({ name: "Canada", currency: "CAD" }),
  US: Object.freeze({ name: "United States", currency: "USD" }),
  GB: Object.freeze({ name: "United Kingdom", currency: "GBP" }),
  IE: Object.freeze({ name: "Ireland", currency: "EUR" }),
  FR: Object.freeze({ name: "France", currency: "EUR" }),
  DE: Object.freeze({ name: "Germany", currency: "EUR" }),
  NL: Object.freeze({ name: "Netherlands", currency: "EUR" }),
  AU: Object.freeze({ name: "Australia", currency: "AUD" }),
  NZ: Object.freeze({ name: "New Zealand", currency: "NZD" }),
});

/**
 * "What do you sell?" (plan 6.2, widened beyond books by plan 10.1), also skippable. The answer travels with the shop
 * (`shopFromSignup` › `publishes`, the field's first name, kept so older shops and links still read it). The shop uses
 * it to suggest a look (6.3), to start new products as that kind and to word the setup guide (apps/shop
 * src/app/admin/sells.ts). The first five ids are the old publishing answers and keep their meaning.
 */
export const PUBLISHES = Object.freeze({
  id: "publishes",
  label: "What do you sell?",
  hint: "Optional. We'll suggest a look and set up your shop for it.",
  options: Object.freeze([
    Object.freeze({ id: "books", label: "Books" }),
    Object.freeze({ id: "zines", label: "Zines" }),
    Object.freeze({ id: "comics", label: "Comics" }),
    Object.freeze({ id: "prints", label: "Art and prints" }),
    Object.freeze({ id: "mix", label: "A mix" }),
    Object.freeze({ id: "mixed", label: "Books and other things" }),
    Object.freeze({ id: "clothing", label: "Clothing" }),
    Object.freeze({ id: "shoes", label: "Shoes" }),
    Object.freeze({ id: "jewelry", label: "Jewelry" }),
    Object.freeze({ id: "music", label: "Music" }),
    Object.freeze({ id: "other", label: "Something else" }),
    // A services shop's answers (SERVICE_SELLS below): what the business does.
    Object.freeze({ id: "hair", label: "Hair and beauty" }),
    Object.freeze({ id: "wellness", label: "Health and wellness" }),
    Object.freeze({ id: "lessons", label: "Lessons and tutoring" }),
    Object.freeze({ id: "fitness", label: "Fitness and classes" }),
    Object.freeze({ id: "studio", label: "Studio and creative" }),
    Object.freeze({ id: "services", label: "Other services" }),
  ]),
});

/** Where a shop lives until the press connects its own domain: <web address>.web.app. */
export const ADDRESS_SUFFIX = ".web.app";

/**
 * "Anything else you'll sell?" (Ways to sell, beta; 17 November 2026): the six more things any shop can sell, as an
 * optional pick-any question. The ids are the ways' own (shared/ways/ways.js; ways.test.js checks they match, this
 * file takes no imports). The answer travels with the shop as `alsoSells`: it shows Julian what new shops want, and the
 * shop's Settings › Ways to sell says which ways the owner asked for. It turns nothing on by itself.
 */
export const ALSO_SELLS = Object.freeze({
  id: "alsoSells",
  label: "Anything else you'll sell?",
  hint: "Pick any. They're new, so we'll open them for you one by one.",
  options: Object.freeze([
    Object.freeze({ id: "events", label: "Events & tickets" }),
    Object.freeze({ id: "classes", label: "Classes & workshops" }),
    Object.freeze({ id: "digital", label: "Digital goods" }),
    Object.freeze({ id: "giving", label: "Donations & tips" }),
    Object.freeze({ id: "memberships", label: "Memberships" }),
    Object.freeze({ id: "rentals", label: "Rentals" }),
  ]),
});
/**
 * "What do you sell? Pick all that fit." (product types plan, change 12, 18 November 2026): a product shop picks every
 * kind of thing it sells, so a shop of candles and ceramics is set up for both. The ids are the shop's product groups
 * (apps/shop src/shared/productTypes.ts TYPE_GROUPS; productGroups.test.js checks they match, this file takes no
 * imports). The answer travels with the shop as `productGroups`: the shop's "What is it?" window offers those groups'
 * types first. The first pick also gives the one-word answer (`sells`) the look and the tax kind still read.
 */
export const PRODUCT_GROUPS = Object.freeze({
  id: "productGroups",
  label: "What do you sell?",
  hint: "Pick all that fit. Your shop is set up for each.",
  options: Object.freeze([
    Object.freeze({ id: "clothing", label: "Clothing", sells: "clothing" }),
    Object.freeze({ id: "shoes", label: "Shoes", sells: "shoes" }),
    Object.freeze({ id: "bags", label: "Bags & accessories", sells: "clothing" }),
    Object.freeze({ id: "jewelry", label: "Jewellery", sells: "jewelry" }),
    Object.freeze({ id: "art", label: "Art & prints", sells: "prints" }),
    Object.freeze({ id: "books", label: "Books & paper", sells: "mixed" }),
    Object.freeze({ id: "music", label: "Music & film", sells: "music" }),
    Object.freeze({ id: "home", label: "Home & living", sells: "other" }),
    Object.freeze({ id: "beauty", label: "Beauty & care", sells: "other" }),
    Object.freeze({ id: "food", label: "Food & drink", sells: "other" }),
    Object.freeze({ id: "kids", label: "Kids & toys", sells: "other" }),
    Object.freeze({ id: "plants", label: "Plants & garden", sells: "other" }),
    Object.freeze({ id: "craft", label: "Craft supplies", sells: "other" }),
    Object.freeze({ id: "pets", label: "Pets", sells: "other" }),
    Object.freeze({ id: "tech", label: "Tech & gadgets", sells: "other" }),
    Object.freeze({ id: "not-parcel", label: "Downloads & gift cards", sells: "other" }),
  ]),
});
/** The known groups in a sent answer, in the question's order; anything else is left out. */
export const cleanProductGroups = (value) => (Array.isArray(value) ? PRODUCT_GROUPS.options.map((o) => o.id).filter((id) => value.includes(id)) : []);
/** The one-word answer (`sells`) for a product shop's picks: its first group's. */
export const sellsForGroups = (groups) => PRODUCT_GROUPS.options.find((o) => o.id === cleanProductGroups(groups)[0])?.sells ?? "";

/** The known picks in a sent answer, in the question's order; anything else is left out. */
export const cleanAlsoSells = (value) => (Array.isArray(value) ? ALSO_SELLS.options.map((o) => o.id).filter((id) => value.includes(id)) : []);

/**
 * The front door's shop question (shop types plan, 26 November 2026, Julian): Product shop, Services or Both. A product
 * shop sells things it ships (and gets the book tools only when it says it sells books, in its setup guide or in What
 * you offer); a services shop (a salon, a studio, a tutor) gets Bookings, clients and payments for appointments in place
 * of products, stock and shipping; Both gets the two. Every kind can be changed later in the admin.
 *
 * The answer is still saved as one of PUBLISHES' ids, so everything that reads a shop's `publishes`/`sells`
 * (shared/sells/sells.js, the shop's shopSells.ts) keeps working: a product shop is one of GENERAL_SELLS (or a book
 * answer, which turns the book tools on), a services shop one of SERVICE_SELLS, and Both a SERVICE_SELLS answer with
 * `sellsProducts: true` (the shop's "Sell products too", WhatYouSellCard.tsx). BOOK_SELLS and SERVICE_SELLS must match
 * sells.js (sells.test.js checks).
 *
 * The Services and Both cards show only while the control room's "Services shops can sign up" is on
 * (settings.servicesShops, sent to the page as `servicesOpen`); the server refuses a services answer while it is off
 * (frontDoor.js).
 */
export const BOOK_SELLS = Object.freeze(["books", "zines", "comics", "mix"]);
export const SHOP_TYPES = Object.freeze([
  Object.freeze({ id: "products", label: "Product shop", line: "Clothing, prints, books, records or anything you make and ship.", tools: "Products · stock · shipping" }),
  Object.freeze({ id: "services", label: "Services", line: "Salons, studios, lessons, therapy. People book a time with you.", tools: "Calendar · clients · deposits" }),
  Object.freeze({ id: "both", label: "Both", line: "You sell things and take bookings, like a studio that sells its work.", tools: "Products · bookings · clients" }),
]);
/** The kinds that need "Services shops can sign up" on (the control room switch). */
export const SERVICE_TYPES = Object.freeze(["services", "both"]);
/** A product shop's "What do you sell?" choices, each a PUBLISHES id (it picks the suggested look and the tax kind). */
export const GENERAL_SELLS = Object.freeze([
  Object.freeze({ id: "clothing", label: "Clothing & accessories" }),
  Object.freeze({ id: "prints", label: "Art & prints" }),
  Object.freeze({ id: "jewelry", label: "Jewellery" }),
  Object.freeze({ id: "shoes", label: "Shoes" }),
  Object.freeze({ id: "music", label: "Music & records" }),
  Object.freeze({ id: "other", label: "Something else" }),
]);
/** A services shop's "What do you do?" choices, each a PUBLISHES id (it picks the sample services and starter site). */
export const SERVICE_SELLS = Object.freeze([
  Object.freeze({ id: "hair", label: "Hair & beauty" }),
  Object.freeze({ id: "wellness", label: "Health & wellness" }),
  Object.freeze({ id: "lessons", label: "Lessons & tutoring" }),
  Object.freeze({ id: "fitness", label: "Fitness & classes" }),
  Object.freeze({ id: "studio", label: "Studio & creative" }),
  Object.freeze({ id: "services", label: "Something else" }),
]);
const SERVICE_IDS = SERVICE_SELLS.map((o) => o.id);
/** True for a services shop's answer. */
export const isServiceSells = (sells) => SERVICE_IDS.includes(sells);
/**
 * "products", "services" or "both" for a saved answer and its "Sell products too"; "" when there is none yet. A
 * bookshop is a product shop (with the book tools); a products answer with `sellsProducts` is still a product shop.
 */
export const shopTypeOf = (sells, sellsProducts = false) => (!sells ? "" : isServiceSells(sells) ? (sellsProducts === true ? "both" : "services") : "products");

// The web address is the shop id, so it follows the shop id's rules (setup/steps.js shopProblems): 6 to 30 lowercase
// letters, digits and hyphens, starting with a letter and not ending with a hyphen. Google refuses ids holding the first
// words; the rest are the platform's own.
const ADDRESS = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
export const NOT_IN_AN_ADDRESS = Object.freeze(["google", "null", "undefined", "ssl"]);
const RESERVED = Object.freeze(["admin", "api", "www", "colophon", "platform", "support", "help", "status", "signup", "accounts"]);

/**
 * Checks a web address the press typed. Returns { ok, address, problem }: `address` is the value lowercased and trimmed,
 * `problem` plain words for the page. Whether it is free is the server's check (signup.js `checkAddressFree`).
 */
export function checkAddress(value) {
  const address = typeof value === "string" ? value.trim().toLowerCase().replace(/\.web\.app$/, "") : "";
  let problem = null;
  if (address.length < 6) problem = "Use at least 6 letters or numbers.";
  else if (address.length > 30) problem = "Use 30 letters or numbers at most.";
  else if (!/^[a-z0-9-]+$/.test(address)) problem = "Use only letters, numbers and hyphens (-).";
  else if (!/^[a-z]/.test(address)) problem = "Start with a letter.";
  else if (address.endsWith("-")) problem = "End with a letter or a number.";
  else if (!ADDRESS.test(address)) problem = "Use only letters, numbers and hyphens (-).";
  else if (NOT_IN_AN_ADDRESS.some((word) => address.includes(word)) || RESERVED.includes(address)) problem = "That address isn't available. Try another.";
  return { ok: !problem, address, problem };
}

// A best guess at the press's country from the time zone its computer's clock is set to (the front door starts the
// country question on it). A time zone says where someone is far better than a browser language does: a Toronto
// browser in "en-US" or "fr" is still in Canada. Returns "" when the zone isn't one of COUNTRIES' or isn't known.
const ZONE_COUNTRY = [
  [/^America\/(Toronto|Montreal|Nipigon|Thunder_Bay|Iqaluit|Pangnirtung|Rankin_Inlet|Resolute|Atikokan|Coral_Harbour|Winnipeg|Rainy_River|Regina|Swift_Current|Edmonton|Cambridge_Bay|Yellowknife|Inuvik|Creston|Dawson_Creek|Fort_Nelson|Whitehorse|Dawson|Vancouver|Halifax|Glace_Bay|Moncton|Goose_Bay|Blanc-Sablon|St_Johns)$|^Canada\//, "CA"],
  [/^America\/(New_York|Detroit|Kentucky\/.+|Indiana\/.+|Indianapolis|Louisville|Chicago|Menominee|North_Dakota\/.+|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)$|^Pacific\/Honolulu$|^US\//, "US"],
  [/^Europe\/(London|Belfast)$|^GB$/, "GB"],
  [/^Europe\/Dublin$|^Eire$/, "IE"],
  [/^Europe\/Paris$/, "FR"],
  [/^Europe\/(Berlin|Busingen)$/, "DE"],
  [/^Europe\/Amsterdam$/, "NL"],
  [/^Australia\//, "AU"],
  [/^Pacific\/(Auckland|Chatham)$|^NZ(-CHAT)?$/, "NZ"],
];
export function countryFromTimeZone(zone) {
  if (typeof zone !== "string") return "";
  return ZONE_COUNTRY.find(([pattern]) => pattern.test(zone))?.[1] ?? "";
}

// One product since 10 November 2026: every shop gets the website and the stockroom, so there is no plan to choose.
export const PLAN_CHOICES = Object.freeze(["both"]);

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export const isEmail = (value) => typeof value === "string" && value.length <= 254 && EMAIL.test(value.trim());

const clean = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * The start of a shop id from the press's name: lowercase letters, digits and hyphens, starting with a letter, at most
 * 24 characters (the server adds "-" and 5 characters, and Google allows 30). Words Google refuses in a project id
 * ("Google Books" -> "books") are left out, so the address always passes `checkAddress`.
 */
export function slugFromPressName(name) {
  let words = clean(name, 200)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-");
  for (let before = ""; before !== words;) {
    before = words;
    for (const word of NOT_IN_AN_ADDRESS) words = words.split(word).join("");
  }
  const base = words.replace(/-{2,}/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "")
    .slice(0, 24).replace(/-+$/, "");
  return base.length >= 3 ? base : `press${base ? `-${base}` : ""}`.slice(0, 24);
}

/**
 * Checks the sign-up details. Returns { ok, details, problems }, where problems maps a field to plain words for the
 * page to show next to it.
 */
/** The card payment providers a shop can start with (setup/payments.js PAYMENT_PROVIDERS). */
export const PAYMENT_PROVIDER_CHOICES = Object.freeze(["stripe", "square"]);

/**
 * The countries whose presses can take cards with Square: Square works there, in a currency the shop's checkout charges
 * in (CAD, USD, EUR; apps/shop/functions/paymentGuards.js). Square in the UK or Australia would charge GBP or AUD, which
 * checkout can't yet. The setup page keeps its own copy (apps/shop/src/setupMode/cardChoice.ts; form.test.js checks).
 */
export const SQUARE_COUNTRIES = Object.freeze(["CA", "US", "IE", "FR"]);
export const squareWords = (country) => `Square isn't available for presses in ${COUNTRIES[country]?.name ?? "your country"} yet. Pick Stripe in Settings › Payments.`;

export function checkSignup(input) {
  const problems = {};
  const pressName = clean(input?.pressName, 80);
  if (pressName.length < 2) problems.pressName = "Add your press's name.";
  const plan = "both";
  const country = Object.hasOwn(COUNTRIES, input?.country ?? "") ? input.country : "";
  if (!country) problems.country = "Choose where your press is.";
  const rawAnswer = input?.[QUESTION.id];
  const answer = QUESTION.options.some((option) => option.id === rawAnswer) ? rawAnswer : null;
  const rawPublishes = input?.[PUBLISHES.id];
  const publishes = PUBLISHES.options.some((option) => option.id === rawPublishes) ? rawPublishes : null;
  // The web address may be left out: the server then makes one from the press's name.
  let address = null;
  if (typeof input?.address === "string" && input.address.trim()) {
    const checked = checkAddress(input.address);
    if (checked.ok) address = checked.address;
    else problems.address = checked.problem;
  }
  // The terms (terms/terms.js): the box must be ticked; the server checks the version is today's.
  if (input?.termsAccepted !== true) problems.terms = "Tick the box to agree to the terms.";
  const termsVersion = typeof input?.termsVersion === "string" ? input.termsVersion.slice(0, 60) : "";
  // The language the platform writes to the press in (templatesFr.js): French or English when chosen (setup mode's
  // General page, or French from a French browser on the old page). A press that says nothing gets the Quebec rule
  // (French first, then English) from its billing address instead.
  const language = ["fr", "en"].includes(input?.language) ? input.language : null;
  // Who takes the website's card payments (setup's Settings › Payments): Stripe unless Square was picked.
  if (input?.paymentProvider !== undefined && !PAYMENT_PROVIDER_CHOICES.includes(input.paymentProvider)) problems.paymentProvider = "Pick Stripe or Square for card payments.";
  const paymentProvider = PAYMENT_PROVIDER_CHOICES.includes(input?.paymentProvider) ? input.paymentProvider : "stripe";
  if (paymentProvider === "square" && country && !SQUARE_COUNTRIES.includes(country)) problems.paymentProvider = squareWords(country);
  // The press's own time zone, read from its browser (app.js): its shop's day follows it. Left out when unreadable (Eastern time).
  const timeZone = typeof input?.timeZone === "string" && /^[A-Za-z_]+\/[A-Za-z0-9_+\-/]{1,60}$/.test(input.timeZone) ? input.timeZone : null;
  // "Anything else you'll sell?" (ALSO_SELLS): left out when nothing was picked.
  const alsoSells = cleanAlsoSells(input?.[ALSO_SELLS.id]);
  // "What do you sell? Pick all that fit." (PRODUCT_GROUPS): left out when nothing was picked.
  const productGroups = cleanProductGroups(input?.[PRODUCT_GROUPS.id]);
  // Both (SHOP_TYPES): a services answer that sells products too. Only a services answer can carry it.
  const sellsProducts = input?.sellsProducts === true && isServiceSells(publishes);
  const details = { pressName, plan, country, currency: country ? COUNTRIES[country].currency : "", answer, publishes, address, termsVersion, paymentProvider, ...(language ? { language } : {}), ...(timeZone ? { timeZone } : {}), ...(alsoSells.length ? { alsoSells } : {}), ...(productGroups.length ? { productGroups } : {}), ...(sellsProducts ? { sellsProducts } : {}) };
  return { ok: Object.keys(problems).length === 0, details, problems };
}
