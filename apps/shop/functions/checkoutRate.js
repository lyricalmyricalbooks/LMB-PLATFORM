/**
 * A carrier quote's price in the shop's own currency (13 November 2026). A carrier answers in its own currency (a US
 * carrier in US dollars, Canada Post in Canadian), which is the shop's for nearly every quote. When it isn't: the
 * carrier's own figure in the other currency (`amount_local`) if that one is the shop's, else the day's rate
 * (`money.rates`: one unit of the shop's currency in cad / usd / eur, as checkout's rate reader gives them), else NaN,
 * and the callers leave that quote out rather than charge a number in the wrong currency. With no `money` (older
 * callers) or a quote that names no currency, the amount is taken as it is.
 */
function rateAmount(rate, money) {
  const amount = parseFloat(rate?.amount);
  const shop = String(money?.currency || "").toUpperCase();
  const quoted = String(rate?.currency || "").toUpperCase();
  if (!shop || !quoted || quoted === shop) return amount;
  if (String(rate?.currency_local || "").toUpperCase() === shop && Number.isFinite(parseFloat(rate.amount_local))) return parseFloat(rate.amount_local);
  const perShopUnit = Number(money?.rates?.[quoted.toLowerCase()]);
  return perShopUnit > 0 ? Math.round((amount / perShopUnit) * 100) / 100 : NaN;
}

/** Preserve the transit data belonging to this exact address/parcel/service quote. */
function checkoutRate(rate, money) {
  const rawDays = rate.estimated_days;
  const days = (typeof rawDays === "number" || (typeof rawDays === "string" && rawDays.trim() !== ""))
    ? Number(rawDays) : NaN;
  return {
    name: `${rate.provider || ""} ${rate.servicelevel?.name || rate.servicelevel?.token || "Shipping"}`.trim(),
    price: rateAmount(rate, money),
    base: rateAmount(rate, money),
    additional: 0,
    deliveryDays: Number.isFinite(days) && days >= 0 ? String(days) : null,
    durationTerms: typeof rate.duration_terms === "string" ? rate.duration_terms.trim() : "",
    carrierEstimate: true,
  };
}
module.exports = { checkoutRate, rateAmount };
