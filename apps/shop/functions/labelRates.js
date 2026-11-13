const CANADA_POST_NAMES = ["canada post", "canadapost", "canada_post"];
const USPS_NAMES = ["usps", "us postal", "united states postal"];
// The post office a shop's labels start from: Canada Post, or USPS for an American shop (shopMoney.js shopCountry).
const HOME_CARRIER = { CA: { name: "Canada Post", names: CANADA_POST_NAMES }, US: { name: "USPS", names: USPS_NAMES } };
const homeCarrier = (country) => HOME_CARRIER[country] || HOME_CARRIER.CA;
const homeCarrierName = (country) => homeCarrier(country).name;

function isHomeCarrierRate(rate, country = "CA") {
  const carrier = [rate?.provider, rate?.carrier, rate?.servicelevel?.token].filter(Boolean).join(" ").toLowerCase();
  return homeCarrier(country).names.some(name => carrier.includes(name));
}
const isCanadaPostRate = (rate) => isHomeCarrierRate(rate, "CA");

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

function canadaPostLabelRates(rates, limit = 5, country = "CA") {
  return (rates || []).filter(rate => isHomeCarrierRate(rate, country)).sort((a, b) => Number(a.amount) - Number(b.amount)).slice(0, limit);
}

// What the label tool offers: the service the customer chose (cheapest quote of it) first, then the shop's own post
// office (Canada Post, or USPS for an American shop).
function labelRatesFor(rates, order, limit = 5, country = "CA") {
  const sold = (rates || []).filter(rate => isSoldRate(rate, order)).sort((a, b) => Number(a.amount) - Number(b.amount)).slice(0, 1);
  const rest = canadaPostLabelRates(rates, limit, country).filter(rate => !sold.includes(rate));
  return [...sold, ...rest].slice(0, limit);
}

// A rate that may be bought from the label tool: the shop's own post office, or the exact service the customer paid for.
const isPurchasableRate = (rate, order, country = "CA") => isHomeCarrierRate(rate, country) || isSoldRate(rate, order);

module.exports = { canadaPostLabelRates, isCanadaPostRate, isHomeCarrierRate, homeCarrierName, isSoldRate, labelRatesFor, isPurchasableRate, soldName };
