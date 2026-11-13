// The sign the admin writes before an amount in the shop's own currency: "CA$", or "US$" in a shop that sells in US
// dollars (shared/shopCurrency, from the shop's profile). Read once when the page opens, like the profile itself.
import { shopCurrency } from "../../lib/shopProfile";
import { currencyName, currencySign } from "../../shared/shopCurrency";

export const SHOP_CURRENCY = shopCurrency();
export const MONEY_SIGN = currencySign(SHOP_CURRENCY);
/** "Canadian dollars" or "US dollars". */
export const MONEY_NAME = currencyName(SHOP_CURRENCY);
