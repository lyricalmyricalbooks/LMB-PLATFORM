// Checkout's flow as one pure reducer: filling in the form, paying (Pay pressed until the provider takes over or the
// attempt ends) and confirming (the landing after a payment, until the order record says paid). Checkout.tsx only
// dispatches events and draws `confirmationView`. Prices, holds and payment authority stay on the server: nothing
// here marks an order paid, it only follows what Stripe's status check and the order record report.

export type StripeStatus = "unknown" | "complete" | "processing";

export type CheckoutFlow =
  | { step: "form" }
  | { step: "paying"; leaving: boolean }
  | {
    step: "confirming";
    orderId: string;
    /** e-Transfer/cash order: instructions instead of a payment check. */
    manual: boolean;
    /** The server refused a retry because this earlier attempt was already paid. */
    previousPaid: boolean;
    /** What Stripe's status check said (never proof of payment on its own). */
    stripe: StripeStatus;
    /** The order record says paid: the only thing that confirms the order. */
    paid: boolean;
    /** Stopped checking before the order record said paid. */
    slow: boolean;
  };

export type CheckoutEvent =
  | { type: "pay" }
  /** The attempt finished; `leaving` = the shopper is being sent to a provider or the confirmation page. */
  | { type: "payEnded"; leaving: boolean }
  /** Browser Back restored the page from its cache after leaving for a provider. */
  | { type: "restored" }
  | { type: "landed"; orderId: string; manual: boolean; previousPaid: boolean }
  /** Stripe's answer to the status check on the landing. */
  | { type: "stripeStatus"; status: string | undefined }
  /** PayPal's capture failed or there was no PayPal token: no money was taken. */
  | { type: "paypalFailed" }
  | { type: "orderSeen"; paymentStatus: string | undefined }
  | { type: "gaveUp" };

export const initialFlow: CheckoutFlow = { step: "form" };

export function checkoutFlow(state: CheckoutFlow, event: CheckoutEvent): CheckoutFlow {
  switch (event.type) {
    case "pay":
      // A second press (or the express wallet during an attempt) changes nothing.
      return state.step === "form" ? { step: "paying", leaving: false } : state;
    case "payEnded":
      if (state.step !== "paying") return state;
      return event.leaving ? (state.leaving ? state : { step: "paying", leaving: true }) : initialFlow;
    case "restored":
      return state.step === "paying" ? initialFlow : state;
    case "landed":
      return { step: "confirming", orderId: event.orderId, manual: event.manual, previousPaid: event.previousPaid, stripe: "unknown", paid: false, slow: false };
    case "stripeStatus":
      if (state.step !== "confirming") return state;
      // The shopper came back without paying: back to the form.
      if (event.status === "open" || event.status === "expired") return initialFlow;
      if (event.status === "complete" || event.status === "processing") return { ...state, stripe: event.status };
      return state;
    case "paypalFailed":
      return state.step === "confirming" ? initialFlow : state;
    case "orderSeen":
      return state.step === "confirming" && event.paymentStatus === "paid" && !state.paid ? { ...state, paid: true } : state;
    case "gaveUp":
      return state.step === "confirming" && !state.paid && !state.slow ? { ...state, slow: true } : state;
  }
}

/** Whether a Stripe status means the bag is bought (money taken or a bank debit under way). */
export const stripeTookPayment = (status: string | undefined) => status === "complete" || status === "processing";

type Confirming = Extract<CheckoutFlow, { step: "confirming" }>;

/** What the confirmation page says (Text & labels › Checkout keys). */
export function confirmationView(state: Confirming, order: { paymentStatus?: string } | null | undefined) {
  const manual = state.manual || order?.paymentStatus === "pending";
  const confirmed = state.paid || state.stripe === "complete";
  return {
    manual,
    stamp: !manual && confirmed ? "paid" as const : "unpaid" as const,
    headline: manual ? "coOrderPlaced" : confirmed ? "coOrderConfirmed" : "coFinalizing",
    /** The line under the order number; none for manual orders. */
    status: manual ? null
      : state.paid ? "coConfirmationSent"
        : state.stripe === "processing" ? "coPaymentProcessing"
          : state.slow
            // "Went through" only when Stripe itself said so; otherwise ask them to check.
            ? (state.stripe === "complete" ? "coConfirmingSlow" : "coConfirmingUnverified")
            : "coConfirming",
  };
}

/** The landing's address: which return this is and the address it settles on (so a refresh doesn't replay it). */
export function readReturn(search: string, pathname: string) {
  const params = new URLSearchParams(search);
  const orderId = params.get("order_id") || "";
  const paypal = params.get("paypal_return") === "true";
  const success = params.get("success") === "true";
  const manual = params.get("manual") === "true";
  const previousPaid = params.get("previous_paid") === "true";
  return {
    orderId,
    /** A payment return worth confirming (otherwise the form shows). */
    landing: Boolean(orderId && (paypal || success)),
    paypal,
    paypalToken: params.get("token") || "",
    manual,
    previousPaid,
    canceled: Boolean(params.get("canceled")),
    stripeSessionId: params.get("session_id") || "",
    stripeIntentId: params.get("payment_intent") || "",
    settledUrl: `${pathname}?order_id=${encodeURIComponent(orderId)}&success=true${manual ? "&manual=true" : ""}${previousPaid ? "&previous_paid=true" : ""}`,
  };
}
