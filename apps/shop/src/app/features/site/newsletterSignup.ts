// Newsletter sign-up shared by the footer's Newsletter box and the Newsletter sections (including the pop-up one).
// Double opt-in: the server stores a pending signup (with the consent text and time) and emails a signed
// confirmation link; the address joins the list only when its owner clicks it. Browsers never write the
// `newsletter` collection (firestore.rules), so nobody can add a stranger's address.
import { functionFetch } from "../../lib/functionsBase";
import { inEditorPreview } from "../../lib/trackingGuard";
import { ga4Event } from "../../lib/ga4";

export const isEmailAddress = (email: string) => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(String(email || "").trim());

/** Resolves when the confirmation email is on its way (or the address is already subscribed); rejects "invalid-email" or "busy" / "failed". */
export async function subscribeNewsletter(email: string, source: string): Promise<void> {
  if (!isEmailAddress(email)) throw new Error("invalid-email");
  // The Studio preview runs the real storefront: it shows the success state but never adds a subscriber.
  if (inEditorPreview()) return;
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "newsletterSignup", email: email.trim().toLowerCase(), source: String(source || "website").slice(0, 60) }),
  });
  if (response.ok) {
    ga4Event("newsletter_signup", { method: String(source || "website").slice(0, 60) });
    return;
  }
  throw new Error(response.status === 400 ? "invalid-email" : response.status === 429 ? "busy" : "failed");
}

/** Confirms (`confirm`) or removes (`unsubscribe`) a subscription from the signed link in an email. */
export async function newsletterLinkAction(action: "confirm" | "unsubscribe", email: string, token: string): Promise<boolean> {
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action === "confirm" ? { action: "newsletterConfirm", email, token } : { action: "unsubscribe", email, token }),
  });
  return response.ok;
}
