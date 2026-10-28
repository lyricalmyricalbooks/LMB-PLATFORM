// Settings › Taxes › Start from a preset (plan 2.10). A preset fills in the rates a new press most often needs, in the
// draft only (nothing applies until Save), and never changes a rate the press already has. Rates as of October 2026;
// the press checks them, and the page says so. Each added rate gets its name in the books (GST, HST ON…, plan 7.11).
import { regionsFor } from "../features/site/postalRegion";
import { suggestedTaxBookName } from "../../shared/taxBooks";
import type { TaxRate } from "./taxRatesEdit";

export type TaxPreset = { id: string; label: string; description: string; country: string; rates: Record<string, string> };

const CANADA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
const everywhere = (rate: string) => Object.fromEntries(CANADA_PROVINCES.map((code) => [code, rate]));

export const TAX_PRESETS: TaxPreset[] = [
  {
    id: "ca-books",
    label: "Canada: printed books",
    description: "5% GST in every province and territory. Provinces with HST give back their share at the till on printed books, so books pay GST only. Provincial sales tax (PST or QST) isn't included: add it where you are registered and it applies to books.",
    country: "Canada",
    rates: everywhere("5"),
  },
  {
    id: "ca-goods",
    label: "Canada: GST/HST on other goods",
    description: "13% HST in Ontario, 14% in Nova Scotia, 15% in New Brunswick, Newfoundland and Labrador and Prince Edward Island, and 5% GST everywhere else. Provincial sales tax (PST or QST) isn't included: add it where you are registered.",
    country: "Canada",
    rates: { ...everywhere("5"), ON: "13", NS: "14", NB: "15", NL: "15", PE: "15" },
  },
];

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** The rates with the preset's added for every place that has none yet; `added` and `kept` count the places. */
export function applyTaxPreset(rates: TaxRate[], preset: TaxPreset): { rates: TaxRate[]; added: number; kept: number } {
  const names = new Map((regionsFor(preset.country) || []).map(([code, name]) => [code, name]));
  const next = [...rates];
  let added = 0;
  let kept = 0;
  for (const [code, rate] of Object.entries(preset.rates)) {
    const region = names.get(code);
    if (!region) continue;
    if (next.some((r) => norm(r.country) === norm(preset.country) && norm(r.region) === norm(region))) { kept += 1; continue; }
    next.push({ country: preset.country, region, rate, bookName: suggestedTaxBookName({ country: preset.country, region, rate }) });
    added += 1;
  }
  return { rates: next, added, kept };
}
