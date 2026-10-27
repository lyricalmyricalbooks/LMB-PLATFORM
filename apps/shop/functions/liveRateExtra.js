// Settings › Shipping › Carrier & labels › "Add an extra amount to every live rate": one flat
// CAD amount added to each live carrier quote, both where checkout shows it (getShippoRates)
// and where the order is charged (resolveShipping). Labels the shop buys keep the carrier's price.
const MAX_LIVE_RATE_EXTRA = 50;

/** The amount to add (0 when switched off or unusable), rounded to cents. */
function liveRateExtra(config) {
  const extra = config && config.liveRateExtra;
  if (!extra || extra.enabled !== true) return 0;
  const amount = Number(extra.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(Math.min(amount, MAX_LIVE_RATE_EXTRA) * 100) / 100;
}

/** A carrier price with the extra added, kept to cents. */
function withLiveRateExtra(price, extra) {
  const n = Number(price);
  if (!Number.isFinite(n)) return n;
  return Math.round((n + (extra || 0)) * 100) / 100;
}

/** Cleans what the admin sends; null = not sent (keep the saved value). */
function cleanLiveRateExtra(value) {
  if (!value || typeof value !== "object") return null;
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_LIVE_RATE_EXTRA) {
    throw Object.assign(new Error(`The extra amount must be between $0 and $${MAX_LIVE_RATE_EXTRA}.`), { status: 400 });
  }
  return { enabled: value.enabled === true, amount: Math.round(amount * 100) / 100 };
}

module.exports = { MAX_LIVE_RATE_EXTRA, liveRateExtra, withLiveRateExtra, cleanLiveRateExtra };
