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
    Object.freeze({ id: "clothing", label: "Clothing" }),
    Object.freeze({ id: "shoes", label: "Shoes" }),
    Object.freeze({ id: "jewelry", label: "Jewelry" }),
    Object.freeze({ id: "music", label: "Music" }),
    Object.freeze({ id: "other", label: "Something else" }),
  ]),
});

/** Where a shop lives until the press connects its own domain: <web address>.web.app. */
export const ADDRESS_SUFFIX = ".web.app";

// The web address is the shop id, so it follows the shop id's rules (setup/steps.js shopProblems): 6 to 30 lowercase
// letters, digits and hyphens, starting with a letter and not ending with a hyphen. Google refuses ids holding the first
// words; the rest are the platform's own.
const ADDRESS = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const NOT_IN_AN_ADDRESS = Object.freeze(["google", "null", "undefined", "ssl"]);
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

export const PLAN_CHOICES = Object.freeze(["both", "shop", "stockroom"]);

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export const isEmail = (value) => typeof value === "string" && value.length <= 254 && EMAIL.test(value.trim());

const clean = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * The start of a shop id from the press's name: lowercase letters, digits and hyphens, starting with a letter, at most
 * 24 characters (the server adds "-" and 5 characters, and Google allows 30).
 */
export function slugFromPressName(name) {
  const base = clean(name, 200)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "")
    .slice(0, 24).replace(/-+$/, "");
  return base.length >= 3 ? base : `press${base ? `-${base}` : ""}`.slice(0, 24);
}

/**
 * Checks the sign-up details. Returns { ok, details, problems }, where problems maps a field to plain words for the
 * page to show next to it.
 */
export function checkSignup(input) {
  const problems = {};
  const pressName = clean(input?.pressName, 80);
  if (pressName.length < 2) problems.pressName = "Add your press's name.";
  const plan = PLAN_CHOICES.includes(input?.plan) ? input.plan : "";
  if (!plan) problems.plan = "Choose what you need: the shop, the stockroom or both.";
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
  const details = { pressName, plan, country, currency: country ? COUNTRIES[country].currency : "", answer, publishes, address, termsVersion };
  return { ok: Object.keys(problems).length === 0, details, problems };
}
