// Each payment message handled exactly once (code plan 19.4). Stripe can deliver the same event twice at the same
// moment; reading "seen?" and writing "handled" afterwards lets both copies through. Instead the handler first claims the
// event id in the events store, which only one caller can win (create-if-absent: a Firestore `create()`, or a
// transaction that reads and writes the document). The winner handles the event and marks it done; on a failure it
// releases the claim so Stripe's next try is handled. A claim older than `holdMs` (a handler that crashed half way) can
// be taken over, so a crash never blocks the event for good.
//
// The events store (fakes.js `fakeEventClaims` is the in-memory one):
//   claim(eventId, { at, holdMs }) -> boolean   true when this caller got the event: no row yet, or a claim older than
//                                               holdMs (taken over). False when it is done or claimed by someone else.
//   release(eventId)                            drops a claim that is not done (after a failure)
//   mark(eventId, entry)                        done: the event is handled (as before)
//   seen(eventId) -> boolean                    true once marked done (kept for older callers)
//
// The answer while another copy is still being handled is 409 ("in progress"): Stripe sends an event again on any
// answer that isn't 2xx, so the copy comes back later and finds the event done (200, duplicate) or, if the first
// handler failed, handles it then.

/** How long a claim holds before another delivery may take it over: longer than any one event takes to handle. */
export const CLAIM_HOLD_MS = 5 * 60 * 1000;

/** The status a copy gets while another copy is being handled. Stripe retries anything that isn't 2xx. */
export const IN_PROGRESS_STATUS = 409;

/**
 * Claims one event: "claimed" (handle it, then `mark` or `release`), "duplicate" (already handled) or "in-progress"
 * (another copy has it). A store with no `claim` (an older one) falls back to `seen`.
 */
export async function claimEvent(events, eventId, { at, holdMs = CLAIM_HOLD_MS }) {
  if (typeof events.claim !== "function") return (await events.seen(eventId)) ? "duplicate" : "claimed";
  if (await events.claim(eventId, { at, holdMs })) return "claimed";
  return (await events.seen(eventId)) ? "duplicate" : "in-progress";
}

/** Gives a claim back after a failure. A release that fails is only logged: the claim runs out after holdMs anyway. */
export async function releaseEvent(events, eventId, log = console.error) {
  if (typeof events.release !== "function") return;
  try {
    await events.release(eventId);
  } catch (error) {
    log(`Event ${eventId} couldn't be released (${error?.message ?? error}); it frees itself after ${CLAIM_HOLD_MS / 60000} minutes.`);
  }
}

