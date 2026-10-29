// Settings › Taxes › the first question: "Are you registered for GST/HST?" (plan 15.21).
// A press that has not registered must not charge GST, and the presets charge it. So "No" switches collection off
// (the same switch the page already had) and "Yes" switches it on and opens the presets. Nothing applies until Save.
// The $30,000 line is Canada's small-supplier limit over four calendar quarters: below it registering is optional.
// Not tax advice; the page says to ask an accountant.
import type { TaxPreset } from "./taxPresets";
import { regionsFor } from "../features/site/postalRegion";

export type TaxRegistration = "yes" | "no" | "unanswered";

export function taxRegistration(settings: any): TaxRegistration {
  const v = settings?.taxes?.gstRegistered;
  return v === true ? "yes" : v === false ? "no" : "unanswered";
}

/** The taxes block after the press answers. "No" turns collection off and keeps every saved rate. */
export function answerTaxRegistration(taxes: any, registered: boolean) {
  return { ...(taxes || {}), gstRegistered: registered, collect: registered };
}

const PROVINCIAL = { BC: "British Columbia", SK: "Saskatchewan", MB: "Manitoba", QC: "Quebec" } as const;

/** The provinces where this preset adds a provincial sales tax on top of GST (5%), by name. */
export function provincialPlaces(preset: TaxPreset): string[] {
  const names = new Map((regionsFor(preset.country) || []).map(([code, name]) => [code, name]));
  return Object.entries(PROVINCIAL)
    .filter(([code]) => Number(preset.rates[code]) > 5)
    .map(([code, fallback]) => names.get(code) || fallback);
}

export function provincialQuestion(places: string[]) {
  return {
    title: "Are you registered for provincial sales tax?",
    message: `This preset charges provincial sales tax in ${places.join(", ")}. Charge it only where you are registered with that province; otherwise customers there would be charged a tax you can't pass on. Fill it in anyway?`,
    confirmLabel: "Yes, I am registered",
  };
}

export const REGISTRATION_WORDS = {
  title: "Are you registered for GST/HST?",
  hint: "You only have to register once your sales pass $30,000 over four calendar quarters, and you may only charge GST/HST once you have a registration number. If you aren't sure, choose No for now. Not tax advice: ask your accountant.",
  no: "No, not yet. Charge no tax.",
  yes: "Yes, I'm registered.",
  savedNo: "Not registered: customers aren't charged tax. Rates stay saved for when you register.",
  savedYes: "Registered: tax is collected at checkout with the rates below.",
  unregisteredPreset: {
    title: "You said you aren't registered",
    message: "Tax is switched off because you aren't registered for GST/HST. Fill in the rates anyway? They stay switched off until you say you are registered.",
    confirmLabel: "Fill in the rates",
  },
} as const;
