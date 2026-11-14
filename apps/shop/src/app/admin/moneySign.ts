// The sign the admin writes before an amount in the shop's own currency: "CA$", or "US$" in a shop that sells in US
// dollars (shared/shopCurrency, from the shop's profile). Read once when the page opens, like the profile itself.
import { shopCurrency } from "../../lib/shopProfile";
import { currencyName, currencySign, shopCountryOf } from "../../shared/shopCurrency";

export const SHOP_CURRENCY = shopCurrency();
/**
 * The currency the stockroom's ledger counts in: the shop's own (every stored amount is in it). A saved Tax centre
 * setting for the other of CAD and USD is left over from an older copy of the stockroom that started every shop in
 * Canadian dollars, so it never wins; any other saved currency is the owner's choice and stays.
 */
export function homeCurrency(saved?: unknown): string {
  const code = typeof saved === "string" ? saved.trim().toUpperCase() : "";
  if (!code || code === "CAD" || code === "USD") return SHOP_CURRENCY;
  return code;
}
export const MONEY_SIGN = currencySign(SHOP_CURRENCY);
/** "Canadian dollars" or "US dollars". */
export const MONEY_NAME = currencyName(SHOP_CURRENCY);
/** "CA" or "US": the country the shop is in (shared/shopCurrency shopCountryOf). */
export const SHOP_COUNTRY = shopCountryOf(SHOP_CURRENCY);
/** True in an American shop: US sales tax words, USPS, ounces and pounds, "state" and "ZIP code". */
export const US_SHOP = SHOP_COUNTRY === "US";
/** The post office the shop's parcels start from: the carrier forms start on it. */
export const HOME_CARRIER = US_SHOP ? "USPS" : "Canada Post";
/** What a pay-me-directly bank payment is called: Interac e-Transfer is Canadian only, so an American shop says "bank transfer". */
/** "ZIP code" in an American shop, "Postal code" in a Canadian one: the owner's own address and tools. */
export const POSTAL_LABEL = US_SHOP ? "ZIP code" : "Postal code";
export const BANK_TRANSFER = US_SHOP ? "bank transfer" : "e-Transfer";
/** The same with its brand, for instructions shown to a customer. */
export const BANK_TRANSFER_FULL = US_SHOP ? "bank transfer" : "Interac e-Transfer";
/** Sample values for email previews: the carrier, service and money a shop in this country would really see. */
export const SAMPLE_CARRIER_SERVICE = US_SHOP ? "USPS Ground Advantage" : "Canada Post Expedited Parcel";
