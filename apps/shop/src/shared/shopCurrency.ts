// The shop's own currency (13 November 2026): the one every price, order total and report of a shop is in. A shop made
// in the United States sells in US dollars; every other shop, and every shop made before this, in Canadian dollars.
// The shop's server reads it from its record (functions/shopConfig.js `currency`), its pages from the public profile
// (lib/shopProfile `currency`). Pure: the Functions run the generated copy (functions/shared/shopCurrency.js).

/** The currencies a shop can sell in. */
export const SHOP_CURRENCIES = ["CAD", "USD"] as const;
export type ShopCurrency = (typeof SHOP_CURRENCIES)[number];

const WORDS: Record<ShopCurrency, { sign: string; name: string; one: string }> = {
  CAD: { sign: "CA$", name: "Canadian dollars", one: "Canadian dollar" },
  USD: { sign: "US$", name: "US dollars", one: "US dollar" },
};

/** The shop's currency from what its record or profile says: one it doesn't know, or none, is Canadian dollars. */
export function shopCurrencyOf(value: unknown): ShopCurrency {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (SHOP_CURRENCIES as readonly string[]).includes(code) ? (code as ShopCurrency) : "CAD";
}

/** "CA$" or "US$". */
export const currencySign = (currency: unknown): string => WORDS[shopCurrencyOf(currency)].sign;

/** "Canadian dollars" or "US dollars" (`one` for "1 EUR in Canadian dollars" style sentences that need the singular). */
export const currencyName = (currency: unknown, one = false): string => WORDS[shopCurrencyOf(currency)][one ? "one" : "name"];

/** An amount in the shop's currency, as the admin writes money: "CA$1,234.50". */
export function shopMoney(amount: number, currency: unknown): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n < 0 ? "-" : ""}${currencySign(currency)}${Math.abs(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The country a shop is in, from its currency (13 November 2026): a shop that sells in US dollars is an American shop,
 * every other a Canadian one (Julian, 12 November: a US customer has everything in USD, a Canadian one in CAD). The
 * one place that says so: sales tax words, the starting shipping zone, the carrier, weights and address words read it.
 */
export type ShopCountry = "CA" | "US";
export const shopCountryOf = (currency: unknown): ShopCountry => (shopCurrencyOf(currency) === "USD" ? "US" : "CA");
