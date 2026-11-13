/**
 * Fast saved-card checkout (Stripe Link). Checkout already asks for the shopper's email and name, so the card form is told
 * them: a shopper who saved a card with Link is recognised and pays in one tap, without typing the card again. Nothing is
 * sent until the email looks complete, so Link isn't asked about every half-typed address.
 */
export type LinkPrefill = { billingDetails: { email: string; name?: string } };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function linkPrefill(email: unknown, name?: unknown): LinkPrefill | null {
  const e = String(email ?? "").trim();
  if (!EMAIL.test(e) || e.length > 254) return null;
  const n = String(name ?? "").trim().slice(0, 200);
  return { billingDetails: { email: e, ...(n ? { name: n } : {}) } };
}

/** Whether the card form needs telling again (a different email or name than it was last given). */
export function prefillChanged(last: LinkPrefill | null, next: LinkPrefill | null): boolean {
  if (!next) return false;
  return !last || last.billingDetails.email !== next.billingDetails.email || (last.billingDetails.name || "") !== (next.billingDetails.name || "");
}
