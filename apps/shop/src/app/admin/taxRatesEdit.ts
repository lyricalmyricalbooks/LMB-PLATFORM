// Settings › Taxes (pure, tested). The stored shape is unchanged — settings.taxes.rates is a list of
// { country, region, rate } with rate as the text the owner typed ("13") — because the server's
// matchTaxRate (functions/index.js) and the checkout mirror (features/site/taxRate.ts) read it.

export type TaxRate = { country: string; region: string; rate: string };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Problem with a new/edited rate, or "" when it can be added. `others` excludes the row being edited. */
export function taxRateProblem(draft: { country?: string; region?: string; rate?: string }, others: TaxRate[]): string {
  const country = String(draft.country ?? "").trim();
  const rateText = String(draft.rate ?? "").trim();
  if (!country) return "Choose a country.";
  if (!rateText) return "Enter a rate (use 0 for places you don't charge tax).";
  if (!/^\d+(\.\d+)?$/.test(rateText)) return "Enter the rate as a number, e.g. 13 or 4.712.";
  const rate = Number(rateText);
  if (!(rate >= 0 && rate <= 100)) return "A tax rate must be between 0 and 100%.";
  const region = norm(draft.region);
  if (others.some((r) => norm(r.country) === norm(country) && norm(r.region) === region)) {
    return region ? "There is already a rate for this province/state." : "There is already a country-wide rate for this country.";
  }
  return "";
}

/** The row to store: trimmed, rate kept as text with no trailing junk. */
export function cleanTaxRate(draft: { country?: string; region?: string; rate?: string }): TaxRate {
  return { country: String(draft.country ?? "").trim(), region: String(draft.region ?? "").trim(), rate: String(Number(String(draft.rate ?? "").trim())) };
}
