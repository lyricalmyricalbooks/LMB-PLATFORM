// Get started, step 1: the press's own details (plan 16.2). Pure: reads and writes the same settings fields the
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
const DEFAULT_COUNTRY = "Canada";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;

/** What the form starts with: whatever the shop already has, so a press who came back sees what they typed. */
export function pressDetailsFrom(settings: any): PressDetails {
  const info = settings?.info || {};
  const loc = settings?.location || {};
  return {
    name: String(info.name || ""),
    email: String(info.email || ""),
    street: String(loc.street || ""),
    city: String(loc.city || ""),
    state: String(loc.state || ""),
    zip: String(loc.zip || ""),
    country: String(loc.country || DEFAULT_COUNTRY),
  };
}

/** One plain message per field that needs fixing. An empty object means the form can be saved. */
export function pressDetailsProblems(d: PressDetails): Partial<Record<PressDetailsField, string>> {
  const out: Partial<Record<PressDetailsField, string>> = {};
  const name = d.name.trim();
  const email = d.email.trim();
  if (!name) out.name = "Add your press name.";
  else if (name.length > NAME_MAX) out.name = `Keep the press name to ${NAME_MAX} characters.`;
  if (!email) out.email = "Add an email address customers can write to.";
  else if (!EMAIL.test(email)) out.email = "That email doesn't look right. Check it has an @ and a domain.";
  if (!d.street.trim()) out.street = "Add the street address your orders ship from.";
  if (!d.city.trim()) out.city = "Add your city.";
  if (!d.zip.trim()) out.zip = "Add your postal code.";
  if (!d.country.trim()) out.country = "Choose your country.";
  return out;
}

/**
 * The settings fields to write. Spreads the shop's own `info` and `location` first, so a field this step does not show
 * (the phone number on labels, for one) survives the save.
 */
export function pressDetailsPatch(settings: any, d: PressDetails) {
  return {
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
}
