// Two-step sign-in for shop owners (plan 14.1). Control-room admins always need an authenticator-app code (9.1). An owner
// whose shop is on a paid plan needs one too for the changes that can hurt: the card, the plan, cancelling, how the shop
// pays, and the team. A stolen owner password alone can't redirect money or lock the owner out. A trial doesn't ask, so
// starting is as easy as it can be; the page offers the set-up once the plan is paid.
//
// The proof is on the sign-in pass Firebase signs (`firebase.sign_in_second_factor`), so a browser can't add it.

/** Plan states with money behind them: paying, or a payment being retried. A trial, a pause or an ended plan isn't. */
export const PAID_STATUSES = Object.freeze(["active", "past_due"]);

export const TWO_STEP_FOR_OWNERS = "Your plan is paid, so this change needs two-step sign-in: a code from your authenticator app each time you sign in. Set it up on your account page, then sign in again and repeat the change.";

/** True when this shop's saved plan state is a paid one. */
export const isPaid = (row) => PAID_STATUSES.includes(row?.billing?.status);

/** The refusal in words when a paid shop's owner signed in without a second step; null when it is fine. */
export function ownerTwoStepProblem(claims, row) {
  if (!isPaid(row)) return null;
  const factor = claims?.firebase?.sign_in_second_factor;
  return typeof factor === "string" && factor ? null : { status: 403, message: TWO_STEP_FOR_OWNERS };
}
