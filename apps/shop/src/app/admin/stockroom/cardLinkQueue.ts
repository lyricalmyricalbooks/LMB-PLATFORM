// The pure half of Invoices › Card pay link (invoiceCardPay.ts holds the server calls): reading an invoice's link, and
// noting a link that must stop taking money. Kept apart so the record-changing files can use it without the sign-in code.
type Rec = Record<string, any>;

export type StaleCardLink = { token: string; num: string; why: "changed" | "deleted" | "paid" | "replaced"; at: number; closedAt?: number };

/** The invoice's card link, if it has one this admin made (an old stockroom Stripe link has no token). */
export const cardLinkOf = (inv: Rec | null | undefined): { url: string; token: string } | null =>
  inv?.stripe && typeof inv.stripe.token === "string" && /^[a-f0-9]{32}$/.test(inv.stripe.token) && typeof inv.stripe.url === "string"
    ? { url: inv.stripe.url, token: inv.stripe.token } : null;

export const staleList = (state: Rec): StaleCardLink[] => (Array.isArray(state.cardLinksToClose) ? state.cardLinksToClose : []);

/** Note an invoice's card link as one to close (inside the same change that made it stale). */
export function queueCardLinkClose(state: Rec, inv: Rec | null | undefined, why: StaleCardLink["why"], now: number): void {
  const link = cardLinkOf(inv);
  if (!link || staleList(state).some((l) => l.token === link.token)) return;
  state.cardLinksToClose = [...staleList(state), { token: link.token, num: String(inv?.num || ""), why, at: now }].slice(-100);
}
