const CANADA_POST_NAMES = ["canada post", "canadapost", "canada_post"];

function isCanadaPostRate(rate) {
  const carrier = [rate?.provider, rate?.carrier, rate?.servicelevel?.token].filter(Boolean).join(" ").toLowerCase();
  return CANADA_POST_NAMES.some(name => carrier.includes(name));
}

// The name checkout saves as order.shippingMethod for a live carrier quote ("<provider> <service>").
// Kept identical to checkoutRate.js so a sold service can be matched back to its label rate.
const soldName = rate => `${rate?.provider || ""} ${rate?.servicelevel?.name || rate?.servicelevel?.token || "Shipping"}`.trim();
const normal = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The service the customer paid for, whatever its carrier. Checkout falls back to UPS, USPS and
// the like where Canada Post has no service, so the label tool has to be able to buy those too.
function isSoldRate(rate, order) {
  const sold = normal(order?.shippingMethod);
  return !!sold && normal(soldName(rate)) === sold;
}

function canadaPostLabelRates(rates, limit = 5) {
  return (rates || []).filter(isCanadaPostRate).sort((a, b) => Number(a.amount) - Number(b.amount)).slice(0, limit);
}

// What the label tool offers: the service the customer chose (cheapest quote of it) first, then Canada Post.
function labelRatesFor(rates, order, limit = 5) {
  const sold = (rates || []).filter(rate => isSoldRate(rate, order)).sort((a, b) => Number(a.amount) - Number(b.amount)).slice(0, 1);
  const rest = canadaPostLabelRates(rates, limit).filter(rate => !sold.includes(rate));
  return [...sold, ...rest].slice(0, limit);
}

// A rate that may be bought from the label tool: Canada Post, or the exact service the customer paid for.
const isPurchasableRate = (rate, order) => isCanadaPostRate(rate) || isSoldRate(rate, order);

module.exports = { canadaPostLabelRates, isCanadaPostRate, isSoldRate, labelRatesFor, isPurchasableRate, soldName };
