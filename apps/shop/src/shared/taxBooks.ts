// "Name in your books" for each tax rate (plan 7.11). A rate in Settings › Taxes may carry `bookName` (GST, HST ON,
// PST BC, QST, Exempt…): the name the press's bookkeeper files that tax under. A rate without one gets a suggested name
// from its place and percentage, so presets and older rates are named too. The server keeps each order's tax split by
// that name (`order.taxLines`, cents) and the bookkeeping file adds them up per day (bookkeeping.ts). Pure, shared.

export type TaxRateLike = { country?: string; region?: string; rate?: string | number; bookName?: string };
/** One tax on an order, by the name in the press's books. Cents in the shop's currency. */
export type TaxLine = { name: string; cents: number };

/** Names offered in Settings › Taxes (any other name can be typed). */
// Manitoba's provincial tax is the retail sales tax (RST); the other two are PST (plan 5.10). A combined rate (GST and
// the provincial tax in one rate, as the provincial presets add them) is "GST + PST BC", "GST + RST MB", "GST + QST".
export const TAX_BOOK_NAMES = ["GST", "HST ON", "HST NS", "HST NB", "HST NL", "HST PE", "PST BC", "PST SK", "RST MB", "QST", "GST + PST BC", "GST + PST SK", "GST + RST MB", "GST + QST", "Exempt", "Sales tax"];
export const TAX_BOOK_NAME_MAX = 40;

const CANADA: Record<string, string> = {
  AB: "alberta", BC: "british columbia", MB: "manitoba", NB: "new brunswick", NL: "newfoundland and labrador",
  NS: "nova scotia", NT: "northwest territories", NU: "nunavut", ON: "ontario", PE: "prince edward island",
  QC: "quebec", SK: "saskatchewan", YT: "yukon",
};
const HST = new Set(["ON", "NS", "NB", "NL", "PE"]);
/** The provincial sales tax's name in each province that has one apart from GST. */
const PROVINCIAL: Record<string, string> = { BC: "PST BC", SK: "PST SK", MB: "RST MB" };

const clean = (v: unknown) => String(v ?? "").trim();
const isCanada = (country: unknown) => ["ca", "canada"].includes(clean(country).toLowerCase());

function canadaCode(region: unknown): string {
  const text = clean(region);
  if (!text) return "";
  if (text.length === 2 && CANADA[text.toUpperCase()]) return text.toUpperCase();
  const name = text.toLowerCase().replace(/é/g, "e");
  return Object.keys(CANADA).find((code) => CANADA[code] === name) || "";
}

/** The name a rate gets when the press hasn't typed one. */
export function suggestedTaxBookName(rate: TaxRateLike | null | undefined): string {
  if (!rate) return "Sales tax";
  const percent = Number(clean(rate.rate));
  if (percent === 0) return "Exempt";
  if (isCanada(rate.country)) {
    const code = canadaCode(rate.region);
    if (percent === 5) return "GST";
    if (HST.has(code)) return `HST ${code}`;
    if (code === "QC") return percent === 9.975 ? "QST" : "GST + QST";
    if (PROVINCIAL[code]) return percent <= 7 ? PROVINCIAL[code] : `GST + ${PROVINCIAL[code]}`;
    return code ? `Tax ${code}` : "Sales tax";
  }
  const place = clean(rate.region) || clean(rate.country);
  return place ? `Sales tax ${place}`.slice(0, TAX_BOOK_NAME_MAX) : "Sales tax";
}

/** The rate's name in the books: what the press typed, else the suggestion. */
export function taxBookName(rate: TaxRateLike | null | undefined): string {
  const typed = clean(rate?.bookName).slice(0, TAX_BOOK_NAME_MAX);
  return typed || suggestedTaxBookName(rate);
}

/**
 * An order's tax split by book name, in cents. `parts` are the amounts each matched rate charged (shop currency, not
 * rounded); lines with the same name merge, and the cents always add up to the rounded total (any rounding cent goes
 * to the largest line). Lines that round to nothing are left out.
 */
export function taxLinesFor(parts: { rate: TaxRateLike | null | undefined; amount: number }[]): TaxLine[] {
  const byName = new Map<string, number>();
  let sum = 0;
  for (const part of parts) {
    const amount = Number(part.amount) || 0;
    if (!amount) continue;
    sum += amount;
    const name = taxBookName(part.rate);
    byName.set(name, (byName.get(name) || 0) + amount);
  }
  const lines = [...byName].map(([name, amount]) => ({ name, cents: Math.round(amount * 100) })).filter((l) => l.cents !== 0);
  const drift = Math.round(sum * 100) - lines.reduce((total, l) => total + l.cents, 0);
  if (drift && lines.length) lines.reduce((big, l) => (Math.abs(l.cents) > Math.abs(big.cents) ? l : big)).cents += drift;
  return lines;
}
