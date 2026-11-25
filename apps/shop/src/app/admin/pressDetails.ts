import { homeCountryName } from "../../lib/shopProfile";
import { POSTAL_LABEL } from "./moneySign";
import { countryCode, countryName } from "./shippingCountries";
import { starterFacts, withStarter } from "./starterPolicies";
import type { PolicyKey } from "../features/site/policyPages";
// Get started, step 1: the press's own details (plan 17.2). Pure: reads and writes the same settings fields the
// Settings screen uses (info.name, info.email, location.*), so nothing is stored twice. Shown once, before the look,
// in the Overview's first-visit run (overview/PressDetailsStage.tsx).

/** The fields the press types. They go on receipts, labels and the contact page. */
export interface PressDetails {
  name: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export type PressDetailsField = keyof PressDetails;

/** Colophon launches in Canada first (code plan 15.23), so a blank country starts on Canada. */
const DEFAULT_COUNTRY = homeCountryName();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;

/**
 * What the press already told us at sign-up (sign-up to open shop plan, move 2, 25 November 2026): the brand name (the
 * shop profile's `name`), the country (firstWeek/start's two letters) and the email they signed in with. The admin
 * starts from these and never asks for the name or country again.
 */
export interface SignupFacts {
  name?: string | null;
  country?: string | null;
  email?: string | null;
}

/** What the form starts with: whatever the shop already has, then the sign-up answers, so nothing is typed twice. */
export function pressDetailsFrom(settings: any, known: SignupFacts = {}): PressDetails {
  const info = settings?.info || {};
  const loc = settings?.location || {};
  const knownCountry = known.country && countryCode(known.country) ? countryName(known.country) : "";
  return {
    name: String(info.name || known.name || "").slice(0, NAME_MAX),
    email: String(info.email || known.email || ""),
    street: String(loc.street || ""),
    city: String(loc.city || ""),
    state: String(loc.state || ""),
    zip: String(loc.zip || ""),
    country: String(loc.country || knownCountry || DEFAULT_COUNTRY),
  };
}

/** True when the brand name and country are already settled (in Settings or from sign-up), so the step doesn't ask them. */
export function nameAndCountryKnown(settings: any, known: SignupFacts = {}): boolean {
  const d = pressDetailsFrom(settings, known);
  const country = !!String(settings?.location?.country || "").trim() || !!(known.country && countryCode(known.country));
  return !!d.name.trim() && d.name.trim().length <= NAME_MAX && country;
}

/** One plain message per field that needs fixing. An empty object means the form can be saved. */
export function pressDetailsProblems(d: PressDetails): Partial<Record<PressDetailsField, string>> {
  const out: Partial<Record<PressDetailsField, string>> = {};
  const name = d.name.trim();
  const email = d.email.trim();
  if (!name) out.name = "Add your brand name.";
  else if (name.length > NAME_MAX) out.name = `Keep the brand name to ${NAME_MAX} characters.`;
  if (!email) out.email = "Add an email address customers can write to.";
  else if (!EMAIL.test(email)) out.email = "That email doesn't look right. Check it has an @ and a domain.";
  if (!d.street.trim()) out.street = "Add the street address your orders ship from.";
  if (!d.city.trim()) out.city = "Add your city.";
  if (!d.zip.trim()) out.zip = `Add your ${POSTAL_LABEL.toLowerCase().replace("zip", "ZIP")}.`;
  if (!d.country.trim()) out.country = "Choose your country.";
  return out;
}

/**
 * The settings fields to write. Spreads the shop's own `info` and `location` first, so a field this step does not show
 * (the phone number on labels, for one) survives the save.
 */
export function pressDetailsPatch(settings: any, d: PressDetails, fill?: PolicyFill) {
  const patch: Record<string, any> = {
    info: { ...(settings?.info || {}), name: d.name.trim(), email: d.email.trim() },
    location: {
      ...(settings?.location || {}),
      street: d.street.trim(),
      city: d.city.trim(),
      state: d.state.trim(),
      zip: d.zip.trim(),
      country: d.country.trim(),
    },
  };
  // Sign-up plan, move 4: the store policies a shop needs before it opens come filled in with these details, as if the
  // press had pressed "Start from our wording" on each. Only an empty policy is filled; saved words are never touched.
  if (fill) {
    const facts = starterFacts({ ...settings, ...patch }, fill.sells, fill.cards);
    const policies = { ...(settings?.policies || {}) };
    for (const key of fill.keys) policies[key] = withStarter(policies[key], key, facts);
    patch.policies = policies;
  }
  return patch;
}

/** Which policies the details step fills in, and the facts their wording reads. */
export type PolicyFill = { keys: PolicyKey[]; sells?: string | null; cards?: "Stripe" | "Square" };

/** The policies a shop needs before it opens (launchReadiness's list): privacy and terms only for a services shop. */
export const policiesToFill = (services: boolean): PolicyKey[] => services ? ["privacy", "terms"] : ["shipping", "returns", "privacy", "terms"];
