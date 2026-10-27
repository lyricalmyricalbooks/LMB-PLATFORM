/** Preserve the transit data belonging to this exact address/parcel/service quote. */
function checkoutRate(rate) {
  const rawDays = rate.estimated_days;
  const days = (typeof rawDays === "number" || (typeof rawDays === "string" && rawDays.trim() !== ""))
    ? Number(rawDays) : NaN;
  return {
    name: `${rate.provider || ""} ${rate.servicelevel?.name || rate.servicelevel?.token || "Shipping"}`.trim(),
    price: parseFloat(rate.amount),
    base: parseFloat(rate.amount),
    additional: 0,
    deliveryDays: Number.isFinite(days) && days >= 0 ? String(days) : null,
    durationTerms: typeof rate.duration_terms === "string" ? rate.duration_terms.trim() : "",
    carrierEstimate: true,
  };
}
module.exports = { checkoutRate };
