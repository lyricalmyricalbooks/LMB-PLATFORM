// Which checkout details are missing or wrong, field by field (the form shows each next to its box
// and moves focus to the first). Pure so it is testable without rendering the checkout page.
import { COUNTRIES } from "./shippingZones";
import { regionsFor } from "./postalRegion";

// Countries whose addresses have no postal code: asking for one would turn valid shoppers away.
// One list for the form, the admin and the server (src/shared/addressRules.ts).
import { NO_POSTAL_CODE } from "../../../shared/addressRules";
export { NO_POSTAL_CODE };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function countryCodeOf(country: string): string {
  const v = String(country || "").trim().toLowerCase();
  if (!v) return "";
  const hit = COUNTRIES.find(c => c.name.toLowerCase() === v || c.code.toLowerCase() === v);
  return hit ? hit.code : "";
}

/** True for countries without postal codes, where the ZIP/postal box is optional. */
export function postalCodeOptional(country: string): boolean {
  return NO_POSTAL_CODE.has(countryCodeOf(country));
}

export type DetailField = "email" | "name" | "country" | "street" | "city" | "state" | "zip";
export type DetailProblem = { field: DetailField; copyKey: string };

/** Text & labels › Checkout key that words each problem. */
export const DETAIL_COPY = {
  emailMissing: "coErrFieldEmail",
  emailFormat: "coErrEmailFormat",
  name: "coErrFieldName",
  country: "coErrFieldCountry",
  street: "coErrFieldStreet",
  city: "coErrFieldCity",
  state: "coErrFieldState",
  stateDigital: "coErrFieldStateDigital",
  zip: "coErrFieldZip",
} as const;

export type DetailsInput = {
  name: string; email: string;
  address: { street: string; city: string; state: string; zip: string; country: string };
  /** E-books / gift cards only: nothing ships, but the buyer's country and province still set the tax. */
  digitalOnly: boolean;
  /** A delivery address is collected (shipping, local delivery, or pickup that asks for one). */
  needsDeliveryAddress: boolean;
};

const blank = (v: unknown) => !String(v ?? "").trim();

/** Problems in page order (email, name, country, street, city, state, postal code). */
export function checkoutDetailProblems(input: DetailsInput): DetailProblem[] {
  const out: DetailProblem[] = [];
  const a = input.address;
  if (blank(input.email)) out.push({ field: "email", copyKey: DETAIL_COPY.emailMissing });
  else if (!EMAIL_PATTERN.test(String(input.email).trim())) out.push({ field: "email", copyKey: DETAIL_COPY.emailFormat });
  if (blank(input.name)) out.push({ field: "name", copyKey: DETAIL_COPY.name });
  const hasRegionList = Boolean(regionsFor(a.country));
  if (input.digitalOnly) {
    if (blank(a.country)) out.push({ field: "country", copyKey: DETAIL_COPY.country });
    if (hasRegionList && blank(a.state)) out.push({ field: "state", copyKey: DETAIL_COPY.stateDigital });
    return out;
  }
  if (!input.needsDeliveryAddress) return out;
  if (blank(a.country)) out.push({ field: "country", copyKey: DETAIL_COPY.country });
  if (blank(a.street)) out.push({ field: "street", copyKey: DETAIL_COPY.street });
  if (blank(a.city)) out.push({ field: "city", copyKey: DETAIL_COPY.city });
  // A state or province is required only where the shopper picks from a list (Canada, United States).
  if (hasRegionList && blank(a.state)) out.push({ field: "state", copyKey: DETAIL_COPY.state });
  if (blank(a.zip) && !postalCodeOptional(a.country)) out.push({ field: "zip", copyKey: DETAIL_COPY.zip });
  return out;
}

/**
 * Apple Pay / Google Pay sheets approve the payment before checkout validates the form, so the
 * buttons stay off until name, email and destination are complete (the wallet would otherwise be
 * authorised and then refused).
 */
export function expressWalletEnabled(state: {
  isCompleting: boolean; canPay: boolean; needsDeliveryChoice: boolean; catalogReady: boolean; total: number; problems: DetailProblem[];
  /** Style › Checkout › policy tick box: false while it is asked for and not ticked. */
  termsAccepted?: boolean;
}): boolean {
  return state.termsAccepted !== false && !state.isCompleting && state.canPay && !state.needsDeliveryChoice && state.catalogReady && state.total > 0 && state.problems.length === 0;
}

/** Stable DOM id of a field's input (used for focus and aria-describedby). */
export const detailInputId = (field: DetailField) => `co-field-${field}`;
export const detailErrorId = (field: DetailField) => `co-field-${field}-error`;
