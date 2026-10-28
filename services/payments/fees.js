// The platform's per-order fee: a percentage of each payment, taken through the provider (Stripe's application fee).
// The owner confirmed the fee may exist (28 October 2026); it starts at 0%, so nothing is taken until it is set.
//
// Platform default, from the service's environment:
//   PLATFORM_FEE_BASIS_POINTS  share of each payment, in hundredths of a percent (250 = 2.5%). Default 0.
//   PLATFORM_FEE_REFUNDED      "true" (default): when a press refunds an order, the fee goes back in proportion to the
//                              refund (Stripe's refund_application_fee). "false": the platform keeps it.
//
// Per shop, in the shop's registry row (`platformFee: { basisPoints?, refunded? }`): either value replaces the default
// for that shop only. A missing value keeps the default.
//
// A malformed value stops the service (or that shop's calls): taking the wrong fee from a press is worse than failing.

export const MAX_BASIS_POINTS = 10000;

const basisPoints = (name, value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || Number(text) > MAX_BASIS_POINTS) throw new Error(`${name} must be a whole number from 0 to ${MAX_BASIS_POINTS}, not "${text.slice(0, 20)}"`);
  return Number(text);
};

const yesNo = (name, value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (text !== "true" && text !== "false") throw new Error(`${name} must be "true" or "false"`);
  return text === "true";
};

/** The platform's default fee, from the service's environment. */
export function readFeeSettings(env = {}) {
  return Object.freeze({
    basisPoints: basisPoints("PLATFORM_FEE_BASIS_POINTS", env.PLATFORM_FEE_BASIS_POINTS) ?? 0,
    refunded: yesNo("PLATFORM_FEE_REFUNDED", env.PLATFORM_FEE_REFUNDED) ?? true,
  });
}

export const NO_FEE = Object.freeze({ basisPoints: 0, refunded: true });

/** The fee for one shop: its registry row's `platformFee` over the platform default. */
export function feeForShop(row, defaults = NO_FEE) {
  const own = row?.platformFee;
  if (own !== undefined && (own === null || typeof own !== "object" || Array.isArray(own))) throw new Error("the shop's platformFee must be an object");
  return Object.freeze({
    basisPoints: basisPoints("platformFee.basisPoints", own?.basisPoints) ?? defaults.basisPoints,
    refunded: yesNo("platformFee.refunded", own?.refunded) ?? defaults.refunded,
  });
}

/** Is any fee taken at all? */
export const takesFee = (fee) => fee.basisPoints > 0;

/** The fee on one payment of `amountMinor` (rounded down to the smallest unit), never more than the payment. */
export function feeFor(amountMinor, fee) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return 0;
  return Math.min(Math.floor((amountMinor * fee.basisPoints) / 10000), amountMinor);
}

/** How the press sees the fee: "2.5%", refunded with a refund or not. */
export const feeSummary = (fee) => ({
  percent: fee.basisPoints / 100,
  refundedWithRefunds: fee.refunded,
});
