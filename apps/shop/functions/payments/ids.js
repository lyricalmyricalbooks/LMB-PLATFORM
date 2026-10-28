// Which saved order fields hold a card payment the shop can look up (code plan 2.2b). The order keeps its provider's
// payment in `stripePaymentIntentId` and its hosted checkout in `stripeCheckoutSessionId` (names from before a second
// provider existed). Stripe's ids carry their own prefixes ("pi_", "cs_"); Square's don't, so the Square provider
// (square.js) saves them with ours ("sqpay_", "sqlink_"). Pure helpers, so the sweeps and guards can use them too.

const SQUARE_PAYMENT = "sqpay_";
const SQUARE_CHECKOUT = "sqlink_";

const text = (id) => (typeof id === "string" ? id : "");

/** A saved card payment: a Stripe PaymentIntent or a Square payment. */
const isPaymentId = (id) => text(id).startsWith("pi_") || isSquarePaymentId(id);
/** A saved hosted checkout: a Stripe Checkout Session or a Square payment link. */
const isCheckoutId = (id) => text(id).startsWith("cs_") || isSquareCheckoutId(id);

const isSquarePaymentId = (id) => text(id).startsWith(SQUARE_PAYMENT) && text(id).length > SQUARE_PAYMENT.length;
const isSquareCheckoutId = (id) => text(id).startsWith(SQUARE_CHECKOUT) && text(id).length > SQUARE_CHECKOUT.length;

/** Square's own id with our prefix, and back. */
const squarePaymentId = (id) => `${SQUARE_PAYMENT}${id}`;
const squareCheckoutId = (id) => `${SQUARE_CHECKOUT}${id}`;
const squareIdOf = (id) => text(id).replace(/^sq(pay|link)_/, "");

module.exports = { isPaymentId, isCheckoutId, isSquarePaymentId, isSquareCheckoutId, squarePaymentId, squareCheckoutId, squareIdOf, SQUARE_PAYMENT, SQUARE_CHECKOUT };
