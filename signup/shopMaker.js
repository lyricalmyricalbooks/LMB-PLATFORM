// The shop maker, run from sign-up (code plan 2.6). A sign-up is queued (signup.js); `sweep` (a scheduled function in
// the platform project, every minute) picks up queued shops and shops due another try, and runs the setup steps
// (setup/runner.js) for each. The runner already resumes at the failed step, holds a per-shop lock and logs every step
// to the registry and the shop's audit log, so a retry is simply another run.
//
// What the press sees (the sign-up page polls `GET /api/signup`):
//   queued       waiting for its turn
//   making       the steps are running
//   ready        the shop is live; the owner has their welcome email (setup step 14)
//   waiting      a step failed in a way a retry can fix: plain words, a "Try again" button, and an automatic try after
//                1, 5 and then 15 minutes
//   needs-help   a step stopped for a person (setup's "a person decides" stops): no button; it goes on the repair
//                queue (2.11) and the press is told we're on it
//
// Clients passed in:
//   signups    get / set / list (signup/fakes.js)
//   run        (shop) -> runSteps result: { ok, ran, failedStep?, error?, locked? } (setup/runner.js with shopSteps)
//   registry   getProfile(shopId) -> profile | null (for the shop's address once it's ready)
//   repairs    optional: report({ shopId, check, problem, detail }); passed(shopId, check) (control-room/repairs.js)
//   selfCheck  optional: check(shopId, { why }) (control-room/selfChecks.js): run once the shop is ready
//   line       optional: the sign-up (signup.js), whose admitFromLine() lets presses over the daily cap in first
import { SignupError, personOf } from "./signup.js";

export const AUTO_TRIES = 3;
export const BACKOFF_MINUTES = Object.freeze([1, 5, 15]);
export const RETRY_GAP_SECONDS = 30;

/** What each setup step is doing, in the press's words (setup/steps.js, later-steps.js, payments.js). */
export const STEP_WORDS = Object.freeze({
  1: "saving your shop's name",
  2: "making your shop's own space",
  3: "setting up your shop's sign-in",
  4: "switching on your shop's services",
  5: "making your shop's database and file storage",
  6: "writing your shop's settings",
  7: "locking your shop's data to you and your team",
  8: "starting your shop's checkout and email",
  9: "putting your shop's pages online",
  10: "setting up nightly backups",
  11: "checking your files are private",
  12: "adding your starter pages",
  13: "connecting your payments",
  14: "emailing you the way in",
  15: "checking everything works",
  16: "linking your shop and stockroom",
});

// Setup steps stop "for a person" when what they find is neither done nor untouched: a retry can't fix those.
const NEEDS_A_PERSON = /a person|another press|outside the shops folder|marked for deletion|abandoned|anyone can read|has problems|choose another shop id|, not [a-z]+-[a-z]+\d/i;

/** Is this failure one a retry can fix? */
export const retryable = (error) => !NEEDS_A_PERSON.test(String(error ?? ""));

/** The shop the setup steps make, from a sign-up row. */
export function shopFromSignup(row, { testMode }) {
  return {
    shopId: row.shopId,
    pressName: row.pressName,
    ownerEmail: row.ownerEmail,
    plan: row.plan,
    country: row.country,
    currency: row.currency,
    paymentProvider: row.paymentProvider ?? "stripe",
    // The sign-up question's answer (form.js QUESTION), or null when skipped: it shapes the first-week list (3.3).
    sellingToday: row.answer ?? null,
    // "What do you publish?" (form.js PUBLISHES, plan 6.2), or null when skipped: it suggests the shop's look (6.3).
    publishes: row.publishes ?? null,
    testMode: testMode === true,
  };
}

export function createShopMaker({ signups, run, registry, repairs = null, selfCheck = null, line = null, testMode = true, now = () => new Date() }) {
  const at = () => now().toISOString();
  const later = (minutes) => new Date(now().getTime() + minutes * 60_000).toISOString();

  async function make(shopId) {
    let row = await signups.get(shopId);
    if (!row || row.status === "ready" || row.status === "needs-help") return row;
    const attempts = (row.attempts ?? 0) + 1;
    row = { ...row, status: "making", attempts, lastTryAt: at(), message: null, canRetry: false, nextTryAt: null };
    await signups.set(shopId, row);

    let result;
    try {
      result = await run(shopFromSignup(row, { testMode }));
    } catch (error) {
      // The steps couldn't even start (a bug or a missing setting): a person looks, and the press can still retry.
      result = { ok: false, error: error?.message ?? String(error) };
    }

    if (result.ok) {
      const profile = await registry.getProfile(shopId);
      row = { ...row, status: "ready", readyAt: at(), siteUrl: profile?.siteUrl ?? `https://${shopId}.web.app`, failedStep: null, error: null };
      // Earlier trouble is over; then the self-checks look at the new shop (2.11). Their problems go to the repair
      // queue, never to the press's page, so they can't hold the press up.
      if (repairs?.passed) await repairs.passed(shopId, "shop-maker");
      if (selfCheck) {
        try {
          await selfCheck.check(shopId, { why: "the shop maker finished" });
        } catch { /* the daily sweep checks it again */ }
      }
    } else if (result.locked) {
      // Another run holds the shop (only after a crash, until its lock lapses): look again shortly.
      row = { ...row, status: "waiting", attempts: attempts - 1, nextTryAt: later(BACKOFF_MINUTES[0]), message: "Still working on it. We'll carry on in a minute.", canRetry: false };
    } else if (retryable(result.error)) {
      const doing = STEP_WORDS[result.failedStep] ?? "setting up your shop";
      const auto = attempts < AUTO_TRIES;
      row = {
        ...row, status: "waiting", failedStep: result.failedStep ?? null, error: result.error ?? null, canRetry: true,
        nextTryAt: auto ? later(BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]) : null,
        message: `We couldn't finish ${doing}. Nothing is lost: press Try again and we'll carry on from there${auto ? ", or wait and we'll try again ourselves in a few minutes" : ""}.`,
      };
      if (!auto && repairs) await repairs.report({ shopId, check: "shop-maker", problem: `step ${result.failedStep} keeps failing`, detail: result.error });
    } else {
      row = {
        ...row, status: "needs-help", failedStep: result.failedStep ?? null, error: result.error ?? null, canRetry: false, nextTryAt: null,
        message: `We couldn't finish ${STEP_WORDS[result.failedStep] ?? "setting up your shop"}, and it needs a hand from us. We've been told, and we'll email you when it's done. You don't need to do anything.`,
      };
      if (repairs) await repairs.report({ shopId, check: "shop-maker", problem: `step ${result.failedStep} stopped for a person`, detail: result.error });
    }
    await signups.set(shopId, row);
    return row;
  }

  return {
    make,

    /** Runs every queued shop and every shop due its automatic try. Returns what it did, per shop. */
    async sweep() {
      // Presses waiting for the day's room go first, so a shop let in now is made in this same run (plan 6.13).
      if (line) await line.admitFromLine();
      const due = (await signups.list()).filter((row) => row.status === "queued" || (row.status === "waiting" && row.nextTryAt && row.nextTryAt <= at()));
      const done = [];
      for (const row of due) {
        const after = await make(row.shopId);
        done.push({ shopId: row.shopId, status: after?.status });
      }
      return done;
    },

    /**
     * The press's "Try again": queues the shop for the next sweep (within a minute). Only the shop's owner, only when
     * a retry can help, and not twice within half a minute.
     */
    async retry(claims, shopId) {
      const person = personOf(claims);
      const row = typeof shopId === "string" ? await signups.get(shopId) : null;
      if (!row || row.accountId !== person.accountId) throw new SignupError(404, "We can't find that shop on your account.");
      if (row.status === "ready") return { shopId, status: row.status };
      if (row.status === "queued" || row.status === "making") return { shopId, status: row.status };
      if (!row.canRetry) throw new SignupError(409, "This one needs a hand from us, and we're on it. You don't need to do anything.");
      if (row.lastTryAt && now().getTime() - Date.parse(row.lastTryAt) < RETRY_GAP_SECONDS * 1000) {
        throw new SignupError(429, "We're still on it. Give it a moment before trying again.");
      }
      await signups.set(shopId, { ...row, status: "queued", message: null, canRetry: false, nextTryAt: null, attempts: 0 });
      return { shopId, status: "queued" };
    },
  };
}
