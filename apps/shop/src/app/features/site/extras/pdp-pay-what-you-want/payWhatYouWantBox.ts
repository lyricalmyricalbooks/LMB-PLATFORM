// Pure rules for the "Pay what you want" box on a product page (Digital D2). The buyer types in the currency the shop
// is shown in; the bag and the server keep the shop's own currency.
import { payWhatYouWantMax } from "../../../../../shared/payWhatYouWant";

/** "1,000.50", "1 000,50" and "12,5" all read as plain numbers: a comma with one or two digits after it is the decimal mark. */
function plainNumber(typed: string): string {
  const text = typed.trim().replace(/[^0-9.,]/g, "");
  if (text.includes(".")) return text.replace(/,/g, "");
  return /,\d{1,2}$/.test(text) ? text.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "") : text.replace(/,/g, "");
}

export type AmountCheck = { amount: number } | { problem: "low" | "high" | "number" };

/**
 * What the buyer typed, in the shop's currency: `rate` is how many of the shown currency make one of the shop's.
 * Empty means the lowest amount. Amounts within half a cent of the lowest count as the lowest (conversion rounding).
 */
export function readAmount(typed: string, lowest: number, rate: number): AmountCheck {
  const text = plainNumber(typed);
  if (!text) return { amount: lowest };
  const shown = Number(text);
  if (!Number.isFinite(shown) || shown < 0) return { problem: "number" };
  const r = rate > 0 ? rate : 1;
  const amount = Math.round((shown / r) * 100) / 100;
  if (amount < lowest - 0.005 / r - 0.0001) return { problem: "low" };
  if (amount > payWhatYouWantMax(lowest)) return { problem: "high" };
  return { amount: Math.max(lowest, amount) };
}
