// The sign the admin writes before an amount in the shop's own currency: "CA$", or "US$" in a shop that sells in US
// dollars (shared/shopCurrency, from the shop's profile). Read once when the page opens, like the profile itself.
import { shopCurrency } from "../../lib/shopProfile";
import { currencyName, currencySign, shopCountryOf } from "../../shared/shopCurrency";

export const SHOP_CURRENCY = shopCurrency();
export const MONEY_SIGN = currencySign(SHOP_CURRENCY);
/** "Canadian dollars" or "US dollars". */
export const MONEY_NAME = currencyName(SHOP_CURRENCY);
/** "CA" or "US": the country the shop is in (shared/shopCurrency shopCountryOf). */
export const SHOP_COUNTRY = shopCountryOf(SHOP_CURRENCY);
/** True in an American shop: US sales tax words, USPS, ounces and pounds, "state" and "ZIP code". */
export const US_SHOP = SHOP_COUNTRY === "US";
/** The post office the shop's parcels start from: the carrier forms start on it. */
export const HOME_CARRIER = US_SHOP ? "USPS" : "Canada Post";
