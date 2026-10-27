// When checkout asks the carrier for live shipping rates, and when it must ask again.
import { addressMissing } from "./addressRules";

/**
 * The address is complete enough for a live carrier quote: the same boxes Pay requires
 * (a province/state only for Canada and the US, a postal code unless the country has none).
 * The server prices live rates for any such address, so checkout must ask for them too —
 * otherwise it shows profile rates the server then refuses.
 */
export function liveRatesAddressReady(address: any): boolean {
  return addressMissing({ ...(address || {}), country: address?.country || "Canada" }).length === 0;
}

/** Server code for "the rate you picked isn't one of the carrier's current rates". */
export const SHIPPING_RATES_CHANGED = "shipping_rates_changed";

/** A Pay refusal that means checkout should fetch the live rates again and let the shopper review them. */
export function shouldRefetchRates(data: any): boolean {
  return data?.code === SHIPPING_RATES_CHANGED;
}
