// The platform's own settings: prices, trial length, the platform's name, domain and email addresses. Each one is read
// from the environment of the service that runs. Defaults are Julian's answers of 28 October 2026 (Colophon; $29 shop,
// $19 stockroom, $39 both, CAD; 14-day trial; notifications@ and support@ the platform domain); the domain itself is a
// placeholder until he has one.
// Keys are never settings here: the email key and the Stripe key are read only where they are used
// (services/email, services/payments).
//
//   PLATFORM_NAME              the product's name, in every customer-facing word     default "Colophon"
//   PLATFORM_DOMAIN            the platform's own domain                             default platform.example (placeholder)
//   PLATFORM_SENDER_EMAIL      the address every email is sent from                  default notifications@<domain>
//   PLATFORM_SUPPORT_EMAIL     where replies to platform emails go                   default support@<domain>
//   PLATFORM_MAILING_ADDRESS   Colophon's mailing address (a PO box is fine), at the foot of every email; Canadian
//                              anti-spam law asks for it in commercial emails (15.8)     default none
//   PLATFORM_CURRENCY          the currency plans are charged in                     default CAD
//   PLAN_PRICE_SHOP            monthly price of the shop alone, in cents             default 2900 ($29)
//   PLAN_PRICE_STOCKROOM       monthly price of the stockroom alone, in cents        default 1900 ($19)
//   PLAN_PRICE_BOTH            monthly price of the shop and the stockroom, cents    default 3900 ($39)
//   TRIAL_DAYS                 free days before the first charge (no card needed)    default 14
//   PLATFORM_URL               the platform's own pages (sign-up, account)           default https://<domain>
//   SIGNUP_OPEN                "true": anyone may sign up; otherwise waitlist invites only (6.1, 6.13)   default false
//   SIGNUP_DAILY_CAP           new shops made a day; an invite skips it (6.13)       default 10
//   FOUNDING_PERCENT_OFF       the founding offer's discount, for as long as they stay  default 25
//   FOUNDING_PRESSES           how many paying presses get the founding offer        default 25
//   PAY_AS_YOU_SELL_BASIS_POINTS  "pay as you sell" instead of a monthly fee: share of each website sale, in
//                              hundredths of a percent (200 = 2%); 0 turns the option off (6.19)   default 200
//
// The control room can change the settings in EDITABLE without a release (plan 9.4): they are saved in the platform
// project and `liveSettings` puts them on top of these. The rest (name, domain, addresses, currency) stay here.

export const DEFAULT_SETTINGS = Object.freeze({
  platformName: "Colophon",
  domain: "platform.example",
  senderEmail: "notifications@platform.example",
  supportEmail: "support@platform.example",
  mailingAddress: "",
  currency: "CAD",
  prices: Object.freeze({ shop: 2900, stockroom: 1900, both: 3900 }),
  trialDays: 14,
  platformUrl: "https://platform.example",
  signupOpen: false,
  signupDailyCap: 10,
  foundingOffer: Object.freeze({ percentOff: 25, presses: 25 }),
  payAsYouSell: Object.freeze({ basisPoints: 200 }),
});

export const PLAN_NAMES = Object.freeze({ shop: "Shop", stockroom: "Stockroom", both: "Shop and stockroom" });

// Stripe takes amounts in cents: one cent to $10,000 a month.
const LIMITS = Object.freeze({
  "prices.shop": { min: 1, max: 1_000_000 },
  "prices.stockroom": { min: 1, max: 1_000_000 },
  "prices.both": { min: 1, max: 1_000_000 },
  trialDays: { min: 0, max: 730 },
  signupDailyCap: { min: 0, max: 1000 },
  "foundingOffer.percentOff": { min: 0, max: 100 },
  "foundingOffer.presses": { min: 0, max: 1000 },
  "payAsYouSell.basisPoints": { min: 0, max: 2000 },
});

const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;

/**
 * The settings, from `env` (process.env by default). A value that is set but wrong throws, in plain words, so a typo in
 * a price never reaches a press's bill; a value that is not set uses its placeholder.
 */
export function platformSettings(env = process.env) {
  const problems = [];
  const text = (name, fallback) => (typeof env[name] === "string" && env[name].trim() ? env[name].trim() : fallback);
  const email = (name, fallback) => {
    const value = text(name, fallback).toLowerCase();
    if (!EMAIL.test(value)) problems.push(`${name} is not an email address`);
    return value;
  };
  const whole = (name, fallback, { min, max }) => {
    const raw = text(name, null);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
      problems.push(`${name} must be a whole number from ${min} to ${max}`);
      return fallback;
    }
    return Number(raw);
  };
  const yesNo = (name, fallback) => {
    const raw = text(name, null);
    if (raw === null) return fallback;
    if (!/^(true|false)$/i.test(raw)) {
      problems.push(`${name} must be true or false`);
      return fallback;
    }
    return raw.toLowerCase() === "true";
  };

  const domain = text("PLATFORM_DOMAIN", DEFAULT_SETTINGS.domain).toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) problems.push("PLATFORM_DOMAIN must be a domain like colophon.example");
  const platformName = text("PLATFORM_NAME", DEFAULT_SETTINGS.platformName).replace(/[\r\n"<>\\]+/g, " ").slice(0, 60).trim();
  const currency = text("PLATFORM_CURRENCY", DEFAULT_SETTINGS.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) problems.push("PLATFORM_CURRENCY must be a three-letter code like CAD");
  const mailingAddress = text("PLATFORM_MAILING_ADDRESS", "").replace(/\s*[\r\n]+\s*/g, ", ");
  if (mailingAddress && (mailingAddress.length < 10 || mailingAddress.length > 200 || /[<>"\\]/.test(mailingAddress))) problems.push("PLATFORM_MAILING_ADDRESS must be a street or PO box address of 10 to 200 characters");
  const platformUrl = text("PLATFORM_URL", `https://${domain}`).replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(platformUrl)) problems.push("PLATFORM_URL must be an https address with no path");

  const settings = {
    platformName,
    domain,
    senderEmail: email("PLATFORM_SENDER_EMAIL", `notifications@${domain}`),
    supportEmail: email("PLATFORM_SUPPORT_EMAIL", `support@${domain}`),
    mailingAddress,
    currency,
    // Stripe takes amounts in cents; one cent to $10,000 a month.
    prices: {
      shop: whole("PLAN_PRICE_SHOP", DEFAULT_SETTINGS.prices.shop, LIMITS["prices.shop"]),
      stockroom: whole("PLAN_PRICE_STOCKROOM", DEFAULT_SETTINGS.prices.stockroom, LIMITS["prices.stockroom"]),
      both: whole("PLAN_PRICE_BOTH", DEFAULT_SETTINGS.prices.both, LIMITS["prices.both"]),
    },
    // Stripe allows trials of up to two years; 0 means no trial.
    trialDays: whole("TRIAL_DAYS", DEFAULT_SETTINGS.trialDays, LIMITS.trialDays),
    platformUrl,
    signupOpen: yesNo("SIGNUP_OPEN", DEFAULT_SETTINGS.signupOpen),
    signupDailyCap: whole("SIGNUP_DAILY_CAP", DEFAULT_SETTINGS.signupDailyCap, LIMITS.signupDailyCap),
    foundingOffer: {
      percentOff: whole("FOUNDING_PERCENT_OFF", DEFAULT_SETTINGS.foundingOffer.percentOff, LIMITS["foundingOffer.percentOff"]),
      presses: whole("FOUNDING_PRESSES", DEFAULT_SETTINGS.foundingOffer.presses, LIMITS["foundingOffer.presses"]),
    },
    payAsYouSell: { basisPoints: whole("PAY_AS_YOU_SELL_BASIS_POINTS", DEFAULT_SETTINGS.payAsYouSell.basisPoints, LIMITS["payAsYouSell.basisPoints"]) },
  };
  if (problems.length) throw new Error(`The platform settings have problems: ${problems.join("; ")}`);
  return settings;
}

/** "$29.00" style text for a price in cents, for emails and the sign-up page. */
export function priceText(cents, currency = DEFAULT_SETTINGS.currency) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(cents / 100);
}

/**
 * The settings the control room may change without a release (plan 9.4), by their path in the settings, with the words
 * the page shows. Money is in cents and the pay-as-you-sell share in hundredths of a percent, as everywhere else.
 */
export const EDITABLE = Object.freeze({
  signupOpen: { kind: "yesNo", label: "Anyone can sign up (off: waitlist invites only)" },
  signupDailyCap: { kind: "whole", ...LIMITS.signupDailyCap, label: "New shops a day (an invite skips the line)" },
  "prices.shop": { kind: "cents", ...LIMITS["prices.shop"], label: "Shop plan, a month" },
  "prices.stockroom": { kind: "cents", ...LIMITS["prices.stockroom"], label: "Stockroom plan, a month" },
  "prices.both": { kind: "cents", ...LIMITS["prices.both"], label: "Shop and stockroom plan, a month" },
  trialDays: { kind: "whole", ...LIMITS.trialDays, label: "Free trial days" },
  "foundingOffer.percentOff": { kind: "whole", ...LIMITS["foundingOffer.percentOff"], label: "Founding offer: percent off, for as long as they stay" },
  "foundingOffer.presses": { kind: "whole", ...LIMITS["foundingOffer.presses"], label: "Founding offer: how many paying presses get it" },
  "payAsYouSell.basisPoints": { kind: "basisPoints", ...LIMITS["payAsYouSell.basisPoints"], label: "Pay as you sell: share of each website sale (0 turns it off)" },
});

const read = (settings, path) => path.split(".").reduce((value, key) => value?.[key], settings);

/** Plain-words problems with saved values ({ path: value }); empty when every one is allowed. */
export function savedSettingsProblems(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return ["the saved settings must be a list of values"];
  const problems = [];
  for (const [path, value] of Object.entries(values)) {
    const field = EDITABLE[path];
    if (!field) problems.push(`${path} can't be changed here`);
    else if (field.kind === "yesNo" ? typeof value !== "boolean" : !Number.isInteger(value) || value < field.min || value > field.max) {
      problems.push(field.kind === "yesNo" ? `${field.label}: choose yes or no` : `${field.label}: a whole number from ${field.min} to ${field.max}`);
    }
  }
  return problems;
}

/** The settings with saved values ({ path: value }) on top. Throws on a value that isn't allowed. */
export function withSaved(settings, values = {}) {
  const problems = savedSettingsProblems(values);
  if (problems.length) throw new Error(`The saved platform settings have problems: ${problems.join("; ")}`);
  const out = structuredClone(settings);
  for (const [path, value] of Object.entries(values)) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((node, key) => node[key], out)[last] = value;
  }
  return out;
}

/** The current value of each editable setting, by path. */
export const editableValues = (settings) => Object.fromEntries(Object.keys(EDITABLE).map((path) => [path, read(settings, path)]));

/** Where the control room keeps its changes: `store.get(SETTINGS_RECORD)` -> { values, updatedAt, updatedBy } | null. */
export const SETTINGS_RECORD = "settings";

/**
 * The settings as they are now: the service's environment with the control room's saved changes on top. `store` is
 * the platform's small records (clients/stores.js `firestorePlatformState`); without one, the environment alone.
 */
export async function liveSettings({ env = process.env, store } = {}) {
  const base = platformSettings(env);
  const saved = store ? await store.get(SETTINGS_RECORD) : null;
  return saved?.values ? withSaved(base, saved.values) : base;
}
