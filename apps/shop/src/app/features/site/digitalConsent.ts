// EU, EEA and UK shoppers have 14 days to cancel an online purchase. For a download, that right ends only once the
// download starts *and* the shopper asked for it to start now, knowing they lose the right (EU Consumer Rights Directive
// art. 16(m), UK Consumer Contracts Regulations reg. 37). Checkout asks with a tick box when the bag has a digital item
// and the address is in one of these countries; the answer is kept on the order's history and repeated in the
// confirmation email (functions/sellerDetails.js), which the rules ask for "on a durable medium".
import { countryCodeOf } from "../../../shared/addressRules";

/** The 27 EU countries, the three other EEA countries and the United Kingdom. */
export const CANCEL_RIGHT_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB",
]);

/** The order-history line; functions/sellerDetails.js looks for these exact words (a test keeps them the same). */
export const DIGITAL_CONSENT_NOTE = "Shopper asked for the digital items to be available straight away and agreed that this ends their 14-day right to cancel them.";

/** True when the bag holds a digital item and the shipping or billing country gives a 14-day right to cancel. */
export function needsDigitalConsent(hasDigital: boolean, countries: unknown[]): boolean {
  return hasDigital && countries.some((country) => CANCEL_RIGHT_COUNTRIES.has(countryCodeOf(country)));
}
