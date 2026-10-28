// How a shop pays at a given time (code plan 6.19), from its billing record. Kept apart from paymentWay.js so billing.js
// can use it without importing that file (which imports billing.js).

/** The way a shop pays at `atMs`, from its billing record. A switch that hasn't started yet still shows the old way. */
export function currentPaymentWay(row, atMs) {
  if (row?.paymentWay === "payAsYouSell") return row.paymentWayFrom && atMs < Date.parse(row.paymentWayFrom) ? "monthly" : "payAsYouSell";
  if (row?.payAsYouSell?.until && atMs < Date.parse(row.payAsYouSell.until)) return "payAsYouSell";
  return "monthly";
}

/**
 * The shop's access when it pays as it sells: open, though its subscription has ended (that is the point). Null when
 * the usual rule (ACCESS) applies. billing.js's save() uses it.
 */
export function payAsYouSellAccess(row, atMs, usual) {
  const chosen = row?.paymentWay === "payAsYouSell" || (row?.payAsYouSell?.until && atMs < Date.parse(row.payAsYouSell.until));
  return chosen && usual !== "open" ? "open" : null;
}
