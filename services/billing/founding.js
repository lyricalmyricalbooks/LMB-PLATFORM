// The founding offer, given for real (code plan 22.1). Julian's decision (28 October 2026): the first 25 paying presses
// get 25% off for as long as they stay. Before this, sign-up showed the founding price but nothing marked a press as
// founding, so Stripe would have charged the full price.
//
// - A press becomes **paying** when its first card is saved (Stripe's setup page), or when it chooses pay as you sell.
//   At that moment it claims one of the founding places, if any are left: `seats.claim(shopId, { limit, at })` is
//   create-if-absent in one transaction, so two presses saving cards at the same second can't both take the last place.
// - A founding press's subscription carries a Stripe coupon, `colophon_founding_<percent>`, with `duration: forever`,
//   made the first time it is needed. Stripe keeps the coupon on the subscription through plan changes. A new
//   subscription (starting again, or moving back to monthly) gets it too.
// - Pay as you sell reads the same `founding: true` (paymentWay.js), so the share and the cap come down too.
//
// The percent and the number of places are live settings (`foundingOffer.percentOff`, `foundingOffer.presses`). A place
// once given stays, whatever the settings say later; a percent changed later applies to new places only.
//
// The seats store (fakes.js `fakeFoundingSeats`, clients/platformStores.js `firestoreFoundingSeats`):
//   claim(shopId, { limit, at, percentOff }) -> boolean   true when the shop holds a place (already, or now)
//   count() -> number                                      places given so far

export const foundingCouponId = (percentOff) => `colophon_founding_${percentOff}`;

/** The founding offer as the live settings have it, or null when it is off. */
export function foundingOfferOf(live) {
  const percentOff = live?.foundingOffer?.percentOff;
  const presses = live?.foundingOffer?.presses;
  if (!Number.isInteger(percentOff) || percentOff <= 0 || percentOff > 100) return null;
  if (!Number.isInteger(presses) || presses <= 0) return null;
  return { percentOff, presses };
}

/** A price with the founding share taken off, in minor units (rounded the way the sign-up page shows it). */
export const foundingAmount = (amount, percentOff) => Math.round((amount * (100 - percentOff)) / 100);

/** Makes the founding coupon once (a second call finds it). `call` is billing's Stripe call. */
export async function ensureFoundingCoupon(call, percentOff, platformName) {
  const id = foundingCouponId(percentOff);
  try {
    await call("GET", `/v1/coupons/${id}`);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    await call("POST", "/v1/coupons", {
      params: { id, percent_off: percentOff, duration: "forever", name: `${platformName} founding press (${percentOff}% off)` },
      idempotencyKey: `coupon-${id}`,
    });
  }
  return id;
}
