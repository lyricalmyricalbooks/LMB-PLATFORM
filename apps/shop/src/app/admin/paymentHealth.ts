export type PaymentIssue = { id: string; label: string; detail: string; severity: "blocking" | "warning" };
import { isStripePublishableKey } from "../features/site/stripeLifecycle";

/** Admin readiness checks only. Payment authority remains with provider webhooks. */
export function paymentHealth(payments: any = {}): PaymentIssue[] {
  const issues: PaymentIssue[] = [];
  const stripe = payments.stripe || {};
  const paypal = payments.paypal || {};
  const manual = (payments.manualMethods || []).filter((method: any) => method.enabled);
  if (!stripe.connected && !paypal.connected && manual.length === 0) issues.push({ id: "no-gateway", label: "No payment method is enabled", detail: "Customers cannot complete checkout until at least one method is enabled.", severity: "blocking" });
  if (payments.testMode) issues.push({ id: "test-mode", label: "Sandbox mode is active", detail: "Test payments do not collect real money. Turn this off before launch.", severity: "warning" });
  if (stripe.connected && !(payments.testMode ? stripe.testPublicKey : stripe.publicKey)) issues.push({ id: "stripe-publishable", label: "Stripe publishable key is missing", detail: `Add the ${payments.testMode ? "test" : "live"} publishable key used by the active mode.`, severity: "blocking" });
  else if (stripe.connected && !isStripePublishableKey(payments.testMode ? stripe.testPublicKey : stripe.publicKey, Boolean(payments.testMode))) issues.push({ id: "stripe-invalid", label: "Stripe publishable key is invalid", detail: "Replace the placeholder or wrong-mode key with the publishable key for the active Stripe mode.", severity: "blocking" });
  // Only a key actually left in the public settings doc (a typed, unsaved key is fine —
  // saving moves it to the admin-only store).
  if (stripe.publicSecretLeak) issues.push({ id: "client-secret", label: "A Stripe secret is stored in public settings", detail: "Open Settings › Payments and save once to move it to the private store, then rotate the exposed key in Stripe.", severity: "blocking" });
  // The server can only charge with a secret key for the active mode.
  const typedOrStored = (typed: any, stored: any) => !!(String(typed || "").trim() || stored);
  if (stripe.connected && payments.testMode && !typedOrStored(stripe.testSecretKey, stripe.testSecretKeyStored)) issues.push({ id: "stripe-test-secret", label: "Stripe test secret key is missing", detail: "Sandbox checkout fails without it. Add the sk_test_… key from your Stripe sandbox.", severity: "blocking" });
  if (stripe.connected && !payments.testMode && !typedOrStored(stripe.secretKey, stripe.secretKeyStored)) issues.push({ id: "stripe-live-secret", label: "No live Stripe secret key is stored here", detail: "Checkout will only work if a key is set in Firebase Functions. Use Test connection to confirm, or add your sk_live_… key.", severity: "warning" });
  manual.forEach((method: any) => { if (!String(method.instructions || "").trim()) issues.push({ id: `manual:${method.id}`, label: `${method.name || "Manual payment"} has no instructions`, detail: "Add clear payment steps so the order does not remain pending indefinitely.", severity: "warning" }); });
  return issues;
}
