// Which currency a press pays Colophon in (12 November 2026, Julian): a press in the United States pays in US dollars,
// a press in Canada in Canadian dollars. Stripe keeps one currency per customer, and the customer is the person who
// pays, so the currency is set by the country of their first shop and every later shop of theirs bills the same way.
// The shop's own selling currency is separate and comes from its own country (signup/form.js COUNTRIES).
//
// The fee in each currency is a platform setting: `prices` (the home currency, CAD) and `usdPrices` (services/settings.js).

/** The currencies a platform bill can be in, by the press's country. Anything else bills in the home currency. */
export const BILLING_CURRENCIES = Object.freeze({ CA: "CAD", US: "USD" });

/** "USD" for a press in the United States, the platform's home currency (CAD) for anyone else. */
export function billingCurrencyFor(country, settings) {
  return BILLING_CURRENCIES[String(country ?? "").trim().toUpperCase()] ?? homeCurrency(settings);
}

/** The platform's own currency, the one its costs come in: CAD unless PLATFORM_CURRENCY says otherwise. */
export const homeCurrency = (settings) => String(settings?.currency ?? "CAD").toUpperCase();

/** The currency of a billing row (or a registry row's `billing`): the one kept on it, else the home currency. */
export const currencyOf = (row, settings) => (typeof row?.currency === "string" && /^[A-Za-z]{3}$/.test(row.currency) ? row.currency.toUpperCase() : homeCurrency(settings));

/** The monthly fee for a plan in cents, in `currency`: `usdPrices` for US dollars, `prices` for the home currency. */
export function feeIn(plan, settings, currency = homeCurrency(settings)) {
  const table = String(currency).toUpperCase() === "USD" && homeCurrency(settings) !== "USD" ? settings.usdPrices ?? settings.prices : settings.prices;
  return table[plan];
}

/**
 * Money in words, "$5.00" in the home currency and "US$5.00" in US dollars, so nobody mixes the two up: Canadian
 * presses see the plain dollar sign they always have.
 */
export function moneyWords(cents, currency, settings) {
  const code = String(currency ?? homeCurrency(settings)).toUpperCase();
  const plain = code === homeCurrency(settings);
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: code, currencyDisplay: plain ? "narrowSymbol" : "symbol" }).format(cents / 100);
}
