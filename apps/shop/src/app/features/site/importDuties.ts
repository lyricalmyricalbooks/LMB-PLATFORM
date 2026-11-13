import { homeCountryName } from "../../../lib/shopProfile";
// Import duties notice (plan 12.11). A press that ships abroad can switch on a note at checkout for parcels leaving its
// home country: the buyer's country may charge duties and import tax on delivery, with an optional estimate. Display only.
// The charge is never changed here (the server prices the order), and the press does not collect or pay these.

export type DutiesSetting = { on?: boolean; home?: string; estimateRate?: number | string; countryRates?: string };
export type DutiesNote = { country: string; rate: number | null; amount: number | null };

const ALIASES: Record<string, string> = { ca: "canada", us: "united states", usa: "united states", "u.s.": "united states", "united states of america": "united states", uk: "united kingdom", gb: "united kingdom", "great britain": "united kingdom" };
const norm = (v: unknown) => { const t = String(v ?? "").trim().toLowerCase(); return ALIASES[t] || t; };

/**
 * Per-country estimates typed one per line, "Germany 19" or "Germany: 19%": the last number on the line is the percent.
 * Lines without a country or with a rate outside 0 to 100 are skipped.
 */
export function parseCountryRates(text: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*(.*?)[\s:=,]+(\d+(?:\.\d+)?)\s*%?\s*$/);
    if (!m || !m[1].trim()) continue;
    const percent = Number(m[2]);
    if (percent > 0 && percent <= 100) out.set(norm(m[1]), percent);
  }
  return out;
}

/** The notice for a parcel going to `country`, or null (off, no country yet, or the parcel stays in the home country). */
export function dutiesNote(duties: DutiesSetting | null | undefined, country: unknown, goodsTotal: number): DutiesNote | null {
  if (!duties || duties.on !== true) return null;
  const to = norm(country);
  if (!to || to === norm(duties.home || homeCountryName())) return null;
  const percent = parseCountryRates(duties.countryRates).get(to) ?? Number(duties.estimateRate);
  const rate = Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : null;
  const goods = Number(goodsTotal);
  return { country: String(country).trim(), rate, amount: rate !== null && goods > 0 ? Math.round(goods * rate) / 100 : null };
}
