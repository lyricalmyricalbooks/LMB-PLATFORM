// Get started: shipping (plan 17.11). Pure: which starter fits the press's country, the ship-from
// address checks (step 1's details), the shipping profile the step makes, and whether the step still shows.
// The profile itself is made by the shipping rules already in Settings (shippingProfileStarters.ts, plan 6.9 step 4);
// this step only confirms one starter and never makes a second profile when the shop already has one, so a re-run is safe.

import { buildNewProfile, starterPrices, type ProfileStarterId } from "./shippingProfileStarters";
import { POSTAL_LABEL } from "./moneySign";
import { countryCode } from "./shippingCountries";

/** The starters a press can confirm here. "copy" needs another profile, and "blank" makes nothing (see below). */
export type ShippingStarter = Exclude<ProfileStarterId, "copy">;

/** What the step records once it is finished or skipped (firstWeek/start › shipping). */
export interface ShippingMarker {
  at: string;
  /** The starter that was confirmed and made. Left out when nothing was made. */
  starter?: ShippingStarter;
  /** True when the step made no profile: the shop already had one, the press chose to set shipping up later, or the country needs it by hand. */
  skipped?: boolean;
}

/** The name the starter profile is saved under. */
export const STARTER_PROFILE_NAME = "Standard shipping";

/** Canada gets the Canada and rest-of-world set, the United States the two-country set. Other countries start empty: their zones need the press's own choices. */
export function shippingStarterFor(country: string): ShippingStarter {
  const code = countryCode(country);
  if (code === "CA") return "world";
  if (code === "US") return "north-america";
  return "blank";
}

/** The ship-from address (plan 17.2's details), checked the same way step 1 checks it. Returns plain sentences, one per gap. */
export function shipFromProblems(location: any): string[] {
  const out: string[] = [];
  if (!String(location?.street || "").trim()) out.push("Add the street address your orders ship from.");
  if (!String(location?.city || "").trim()) out.push("Add your city.");
  if (!String(location?.zip || "").trim()) out.push(`Add your ${POSTAL_LABEL.toLowerCase().replace("zip", "ZIP")}.`);
  if (!String(location?.country || "").trim()) out.push("Choose your country.");
  return out;
}

/** The address as one line for the step, or nothing when it isn't complete. */
export function shipFromLine(location: any): string {
  if (shipFromProblems(location).length) return "";
  return [location.street, location.city, location.state, location.zip, location.country]
    .map(part => String(part || "").trim()).filter(Boolean).join(", ");
}

/** The starter's zones and prices, for the step to show before anything is made (the same numbers the Settings dialog suggests). */
export function starterSummary(starter: ShippingStarter, sells?: string | null): { zone: string; first: string; extra: string }[] {
  return starterPrices(starter, sells).map(p => ({ zone: p.zone, first: p.first, extra: p.extra }));
}

/**
 * The profile for the confirmed starter, shaped the way Settings saves a new one. `blank` returns null: nothing is made,
 * and the press sets its zones in Settings › Shipping.
 */
export function starterProfile(starter: ShippingStarter, newId: () => string, sells?: string | null) {
  if (starter === "blank") return null;
  return buildNewProfile({ name: STARTER_PROFILE_NAME, starter, prices: starterPrices(starter, sells) }, newId);
}

/** Whether the step is still to show: a press that went through step 1 (its details), is not a stockroom-only plan, has its look, and hasn't finished this step. Shops made before Get started never see it. */
export function shippingStepShows(doc: { details?: unknown; plan?: string; welcome?: unknown; shipping?: unknown } | null): boolean {
  return !!doc && !!doc.details && doc.plan !== "stockroom" && !!doc.welcome && !doc.shipping;
}
