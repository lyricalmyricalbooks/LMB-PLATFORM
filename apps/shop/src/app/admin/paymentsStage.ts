// Get started: Get paid (plan 17.10). Pure: when the step shows and what it records. The account and its states
// come from the platform's card status (platformPayments.ts, plan 7.9). The step never shows a key or an account ID, and
// skipping it leaves the final check's card blocker in place, so a press can't open a shop that can't take cards.

/** What the step records once it is finished or skipped (firstWeek/start › payments). */
export interface PaymentsMarker {
  at: string;
  /** Cards and payouts were working when the press continued. */
  ready?: boolean;
  /** The press chose to set payments up later. */
  skipped?: boolean;
}

/**
 * Whether the step is still to show: a press that has gone through its details and the look, takes cards through
 * the platform (`platform` is Stripe or Square; a shop on its own keys has none), is not a stockroom-only plan, and hasn't
 * finished this step. Older shops and shops on their own keys never see it.
 */
export function paymentsStepShows(
  doc: { details?: unknown; plan?: string; welcome?: unknown; payments?: unknown } | null,
  platform: "stripe" | "square" | null,
): boolean {
  return !!doc && !!platform && !!doc.details && doc.plan !== "stockroom" && !!doc.welcome && !doc.payments;
}

/** The marker for this step's result: "ready" when cards and payouts work, "skipped" when the press sets it up later. */
export function paymentsMarker(at: string, outcome: "ready" | "skipped"): PaymentsMarker {
  return outcome === "ready" ? { at, ready: true } : { at, skipped: true };
}
