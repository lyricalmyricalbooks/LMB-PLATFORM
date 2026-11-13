// The shop's own currency for server code: the one every price, total and gift card balance of this shop is in
// (shopConfig.currency, from the shop's record: CAD, or USD for a shop that sells in US dollars). Read when the code
// runs, never kept in a module constant: one server runs every shop.
const { currencySign, shopCurrencyOf, shopCountryOf } = require("./shared/shopCurrency");

/** "CAD" or "USD". */
const shopCurrency = () => shopCurrencyOf(require("./shopConfig").shopConfig.currency);
/** "CA$" or "US$", as amounts in the shop's own currency are written. */
const shopSign = () => currencySign(shopCurrency());

/** "CA" or "US": the country the shop is in (shared/shopCurrency shopCountryOf). */
const shopCountry = () => shopCountryOf(shopCurrency());

/** "Canada" or "United States": the fallback wherever an order or the shop's own address has no country. */
const shopCountryName = () => (shopCountry() === "US" ? "United States" : "Canada");

module.exports = { shopCurrency, shopSign, shopCountry, shopCountryName };
