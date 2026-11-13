// GENERATED from src/shared/shopCurrency.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// The shop's own currency (13 November 2026): the one every price, order total and report of a shop is in. A shop made
// in the United States sells in US dollars; every other shop, and every shop made before this, in Canadian dollars.
// The shop's server reads it from its record (functions/shopConfig.js `currency`), its pages from the public profile
// (lib/shopProfile `currency`). Pure: the Functions run the generated copy (functions/shared/shopCurrency.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopCountryOf = exports.currencyName = exports.currencySign = exports.SHOP_CURRENCIES = void 0;
exports.shopCurrencyOf = shopCurrencyOf;
exports.shopMoney = shopMoney;
/** The currencies a shop can sell in. */
exports.SHOP_CURRENCIES = ["CAD", "USD"];
const WORDS = {
    CAD: { sign: "CA$", name: "Canadian dollars", one: "Canadian dollar" },
    USD: { sign: "US$", name: "US dollars", one: "US dollar" },
};
/** The shop's currency from what its record or profile says: one it doesn't know, or none, is Canadian dollars. */
function shopCurrencyOf(value) {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    return exports.SHOP_CURRENCIES.includes(code) ? code : "CAD";
}
/** "CA$" or "US$". */
const currencySign = (currency) => WORDS[shopCurrencyOf(currency)].sign;
exports.currencySign = currencySign;
/** "Canadian dollars" or "US dollars" (`one` for "1 EUR in Canadian dollars" style sentences that need the singular). */
const currencyName = (currency, one = false) => WORDS[shopCurrencyOf(currency)][one ? "one" : "name"];
exports.currencyName = currencyName;
/** An amount in the shop's currency, as the admin writes money: "CA$1,234.50". */
function shopMoney(amount, currency) {
    const n = Number.isFinite(amount) ? amount : 0;
    return `${n < 0 ? "-" : ""}${(0, exports.currencySign)(currency)}${Math.abs(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const shopCountryOf = (currency) => (shopCurrencyOf(currency) === "USD" ? "US" : "CA");
exports.shopCountryOf = shopCountryOf;
