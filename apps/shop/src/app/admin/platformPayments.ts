// Settings › Payments › Card payments for a shop whose cards run through Colophon (plan 2.2b / 2.10): the press's own
// Square or Stripe account, connected through the platform. The words and the return notices live here so they are
// tested without the page.

export type PlatformFee = { percent: number; refundedWithRefunds: boolean };

/** What the platform says about the press's card account (functions/checkoutAdmin.js handlePlatformPayments). */
export type PlatformPaymentsAnswer = {
  provider?: "stripe" | "square";
  connected?: boolean;
  accountId?: string;
  locationName?: string | null;
  currency?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsDue?: number;
  platformFee?: PlatformFee;
  url?: string;
};

export const providerName = (provider: string | undefined) => (provider === "square" ? "Square" : "Stripe");

/** A Stripe account the platform made exists from the start; it is "connected" once its details are in. */
export function accountConnected(answer: PlatformPaymentsAnswer): boolean {
  if (answer.provider === "square") return answer.connected === true;
  return answer.detailsSubmitted === true;
}

/** Plain words for the platform's fee, shown next to payouts (owner's instruction, 28 October 2026). */
export function feeLine(fee: PlatformFee | undefined): string {
  if (!fee || !(fee.percent > 0)) return "Colophon takes no fee on your card sales. You keep everything except your card provider's own fee.";
  const percent = Number.isInteger(fee.percent) ? String(fee.percent) : fee.percent.toFixed(2).replace(/0+$/, "");
  const refunds = fee.refundedWithRefunds
    ? " When you refund a sale, the same share of the fee comes back to you."
    : " The fee stays with Colophon when you refund a sale.";
  return `Colophon keeps ${percent}% of each card sale before it reaches your payouts, on top of your card provider's own fee.${refunds}`;
}

export type ReturnNotice = { tone: "success" | "warning" | "danger"; text: string };

/** What happened when Square or Stripe sent the owner back here (`?square=…` / `?stripe=…`); null when nothing did. */
export function returnNotice(search: string): ReturnNotice | null {
  const params = new URLSearchParams(search);
  const square = params.get("square");
  if (square === "connected") return { tone: "success", text: "Square is connected. Your shop can take cards now." };
  if (square === "denied") return { tone: "warning", text: "Square wasn't connected: the sign-in was cancelled. Press Connect Square to try again." };
  if (square === "in_use") return { tone: "danger", text: "That Square account is already connected to another shop. Sign in with this shop's own Square account." };
  if (square === "other_account") return { tone: "danger", text: "That's a different Square account from the one this shop uses. Sign in with the same account as before." };
  if (square) return { tone: "danger", text: "Square couldn't be connected just now. Wait a minute and press Connect Square again." };
  const stripe = params.get("stripe");
  if (stripe === "return") return { tone: "success", text: "Back from Stripe. If anything is still missing, it's listed below." };
  if (stripe === "refresh") return { tone: "warning", text: "That Stripe page expired. Press Finish Stripe setup to get a new one." };
  return null;
}

/** The address without `square` / `stripe`, so a reload doesn't show the notice again. */
export function withoutReturnFlags(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("square");
  url.searchParams.delete("stripe");
  return url.toString();
}
