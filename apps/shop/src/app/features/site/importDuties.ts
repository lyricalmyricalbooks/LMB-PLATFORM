// Import duties notice (plan 12.11). A press that ships abroad can switch on a note at checkout for parcels leaving its
// home country: the buyer's country may charge duties and import tax on delivery, with an optional estimate. Display only.
// The charge is never changed here (the server prices the order), and the press does not collect or pay these.

export type DutiesSetting = { on?: boolean; home?: string; estimateRate?: number | string };
export type DutiesNote = { country: string; rate: number | null; amount: number | null };

const ALIASES: Record<string, string> = { ca: "canada", us: "united states", usa: "united states", "u.s.": "united states", "united states of america": "united states", uk: "united kingdom", gb: "united kingdom", "great britain": "united kingdom" };
const norm = (v: unknown) => { const t = String(v ?? "").trim().toLowerCase(); return ALIASES[t] || t; };

/** The notice for a parcel going to `country`, or null (off, no country yet, or the parcel stays in the home country). */
export function dutiesNote(duties: DutiesSetting | null | undefined, country: unknown, goodsTotal: number): DutiesNote | null {
  if (!duties || duties.on !== true) return null;
  const to = norm(country);
  if (!to || to === norm(duties.home || "Canada")) return null;
  const percent = Number(duties.estimateRate);
  const rate = Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : null;
  const goods = Number(goodsTotal);
  return { country: String(country).trim(), rate, amount: rate !== null && goods > 0 ? Math.round(goods * rate) / 100 : null };
}
