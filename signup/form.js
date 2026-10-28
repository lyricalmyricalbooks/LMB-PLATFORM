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
  const details = { pressName, plan, country, currency: country ? COUNTRIES[country].currency : "", answer };
  return { ok: Object.keys(problems).length === 0, details, problems };
}
