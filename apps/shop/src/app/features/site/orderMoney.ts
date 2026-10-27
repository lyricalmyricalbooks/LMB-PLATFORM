// Amounts on an order are stored in CAD. A shopper who paid in USD or EUR is shown
// what they were charged: the order's own currency at the rate saved when it was priced.
const SYMBOLS: Record<string, string> = { CAD: "CA$ ", USD: "$ ", EUR: "€ " };

/** An amount already in `currency` (e.g. what Stripe will charge). */
export function amountIn(value: number, currency: string | undefined): string {
  const code = String(currency || "CAD").toUpperCase();
  return `${SYMBOLS[code] || `${code} `}${(Number(value) || 0).toFixed(2)}`;
}

/** A CAD amount from an order, in the currency the order was paid in. */
export function orderMoney(cad: number | undefined, order: any, fallback: (cad: number) => string): string {
  const n = Number(cad) || 0;
  if (order?.checkoutCurrency && Number(order?.exchangeRate) > 0) return amountIn(n * Number(order.exchangeRate), order.checkoutCurrency);
  return fallback(n);
}

/**
 * The order's total as charged. The server charges `expectedAmountMinor` (each line, shipping and tax
 * rounded separately), which can differ by cents from `total × rate`; the email and the Orders CSV
 * print that exact figure, so the site must too. Older orders without it use total × rate.
 */
export function orderChargedTotal(order: any, fallback: (cad: number) => string): string {
  const minor = Number(order?.expectedAmountMinor);
  const currency = order?.expectedCurrency || order?.checkoutCurrency;
  if (Number.isInteger(minor) && minor > 0 && currency) return amountIn(minor / 100, currency);
  return orderMoney(order?.total, order, fallback);
}

/**
 * True when the server's charge (minor units) differs from the total on screen by more than
 * rounding: the server rounds each line, shipping and tax separately, so a few cents is normal.
 * CAD (the catalog currency) has no exchange rate, so only 5 cents is allowed. USD/EUR also
 * allow a day's exchange-rate drift: 5 cents or 1%, whichever is larger.
 */
export function totalNeedsConfirming(serverMinor: number, shownMinor: number, currency?: string): boolean {
  if (!Number.isFinite(serverMinor) || !Number.isFinite(shownMinor)) return false;
  const converted = String(currency || "CAD").toUpperCase() !== "CAD";
  const allowed = converted ? Math.max(5, Math.round(shownMinor * 0.01)) : 5;
  return Math.abs(serverMinor - shownMinor) > allowed;
}
