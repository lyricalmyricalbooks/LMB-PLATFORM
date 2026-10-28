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
//   PLATFORM_CURRENCY          the currency plans are charged in                     default CAD
//   PLAN_PRICE_SHOP            monthly price of the shop alone, in cents             default 2900 ($29)
//   PLAN_PRICE_STOCKROOM       monthly price of the stockroom alone, in cents        default 1900 ($19)
//   PLAN_PRICE_BOTH            monthly price of the shop and the stockroom, cents    default 3900 ($39)
//   TRIAL_DAYS                 free days before the first charge (no card needed)    default 14
//   PLATFORM_URL               the platform's own pages (sign-up, account)           default https://<domain>

export const DEFAULT_SETTINGS = Object.freeze({
  platformName: "Colophon",
  domain: "platform.example",
  senderEmail: "notifications@platform.example",
  supportEmail: "support@platform.example",
  currency: "CAD",
  prices: Object.freeze({ shop: 2900, stockroom: 1900, both: 3900 }),
  trialDays: 14,
  platformUrl: "https://platform.example",
});

export const PLAN_NAMES = Object.freeze({ shop: "Shop", stockroom: "Stockroom", both: "Shop and stockroom" });

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

  const domain = text("PLATFORM_DOMAIN", DEFAULT_SETTINGS.domain).toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) problems.push("PLATFORM_DOMAIN must be a domain like colophon.example");
  const platformName = text("PLATFORM_NAME", DEFAULT_SETTINGS.platformName).replace(/[\r\n"<>\\]+/g, " ").slice(0, 60).trim();
  const currency = text("PLATFORM_CURRENCY", DEFAULT_SETTINGS.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) problems.push("PLATFORM_CURRENCY must be a three-letter code like CAD");
  const platformUrl = text("PLATFORM_URL", `https://${domain}`).replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(platformUrl)) problems.push("PLATFORM_URL must be an https address with no path");

  const settings = {
    platformName,
    domain,
    senderEmail: email("PLATFORM_SENDER_EMAIL", `notifications@${domain}`),
    supportEmail: email("PLATFORM_SUPPORT_EMAIL", `support@${domain}`),
    currency,
    // Stripe takes amounts in cents; one cent to $10,000 a month.
    prices: {
      shop: whole("PLAN_PRICE_SHOP", DEFAULT_SETTINGS.prices.shop, { min: 1, max: 1_000_000 }),
      stockroom: whole("PLAN_PRICE_STOCKROOM", DEFAULT_SETTINGS.prices.stockroom, { min: 1, max: 1_000_000 }),
      both: whole("PLAN_PRICE_BOTH", DEFAULT_SETTINGS.prices.both, { min: 1, max: 1_000_000 }),
    },
    // Stripe allows trials of up to two years; 0 means no trial.
    trialDays: whole("TRIAL_DAYS", DEFAULT_SETTINGS.trialDays, { min: 0, max: 730 }),
    platformUrl,
  };
  if (problems.length) throw new Error(`The platform settings have problems: ${problems.join("; ")}`);
  return settings;
}

/** "$29.00" style text for a price in cents, for emails and the sign-up page. */
export function priceText(cents, currency = DEFAULT_SETTINGS.currency) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(cents / 100);
}
