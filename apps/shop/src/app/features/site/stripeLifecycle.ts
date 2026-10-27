export function createElementCleanup(element: { destroy: () => void }) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Stripe may destroy a failed Element before React unmounts its host.
    try { element.destroy(); } catch { /* Teardown must never prevent leaving checkout. */ }
  };
}
export function isStripePublishableKey(key: string, testMode: boolean) {
  return new RegExp(`^pk_${testMode ? "test" : "live"}_[A-Za-z0-9]{24,}$`).test(key);
}

/** Checkout always keeps Stripe's actual payment fields on this page. */
export function stripeCheckoutState({ keyValid, cardState, paymentStarted }: {
  keyValid: boolean;
  cardState: "loading" | "ready" | "error";
  paymentStarted: boolean;
}) {
  return {
    inline: keyValid,
    canPay: keyValid && cardState === "ready",
    canRetry: keyValid && cardState === "error" && !paymentStarted,
  };
}

/** Lock synchronously, including validation; retain it once navigation starts. */
export function createCheckoutSubmission() {
  let locked = false;
  const run = async (submit: () => Promise<boolean>) => {
    if (locked) return;
    locked = true;
    let navigating = false;
    try { navigating = await submit(); }
    finally { if (!navigating) locked = false; }
  };
  /** The shopper came back from the provider (browser Back): the lock kept for navigation is stale. */
  run.reset = () => { locked = false; };
  return run;
}

/**
 * Calls `onRestored` when the browser shows this page again from its back/forward cache (React state
 * intact, but the provider page we left for is gone). Returns the unsubscribe.
 */
export function onPageRestored(target: Pick<EventTarget, "addEventListener" | "removeEventListener">, onRestored: () => void) {
  const handler = (event: Event) => { if ((event as { persisted?: boolean }).persisted) onRestored(); };
  target.addEventListener("pageshow", handler);
  return () => target.removeEventListener("pageshow", handler);
}
