// The billing door (code plan 6.4): the Plan & billing page's calls on the platform's one web door (signup/api.js
// `routes`). Every call is signed in and is for one shop's owner only, read from the shop's own team (accounts.js
// `roleIn`, as the team page does); staff, authors, bookkeepers and strangers are refused. Every call, done or
// refused, is logged in the registry and the shop's audit log. Each body is JSON with the shop's id.
//
//   POST /api/billing/status       { shopId } -> { billing }: the plan, price, trial or next payment, card, closing apps
//   POST /api/billing/card         { shopId } -> { url }: Stripe's page to add or change the card; it comes back only
//                                  to this shop's Plan & billing page (/account/billing?shop=<id>)
//   POST /api/billing/cancel       { shopId, reason?, words? } -> { cancelAtPeriodEnd }: cancel at the end of the paid
//                                  month (or trial), with the optional answer to "why are you leaving?" (19.8)
//   POST /api/billing/keep         { shopId } -> { cancelAtPeriodEnd }: undo a cancel that hasn't happened yet
//   POST /api/billing/change-plan  { shopId, plan, preview?, reason? } -> { preview } or { plan, changed }: what changes
//                                  and the prorated amount (preview: true, nothing changes), or the change itself, with
//                                  the optional answer to "why are you dropping it?" (closedApps.js DROP_REASONS)
//   POST /api/billing/invoices     { shopId } -> { invoices }: newest first, each with Stripe's PDF link
//   POST /api/billing/payment-way  { shopId } -> { view, status }: how the shop pays (monthly or pay as you sell, 6.19)
//   POST /api/billing/payment-way/switch  { shopId, to } -> { view, status, changed }: switch from the next month (at
//                                  once during the trial); only when the door is given `paymentWay`
//
// Each call reaches the billing service (services/billing) once; the page asks for the status again after a change.
// The door never reads Stripe itself.
import { createHash } from "node:crypto";
import { personOf, SignupError } from "../signup/signup.js";
import { paymentWayView } from "../services/billing/paymentWay.js";
import { ownerTwoStepProblem } from "./twoStep.js";

/** This shop's Plan & billing page: the one place a card page may send people back to. */
export const billingPage = (settings, shopId) => `${settings.platformUrl}/account/billing?shop=${encodeURIComponent(shopId)}`;

export function billingRoutes({ billing, paymentWay = null, accounts, registry, auditLog, settings, now = () => new Date() }) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  let count = 0;

  async function log(shopId, call, by, outcome) {
    const at = now().toISOString();
    const entry = { id: `billing-door-${at}-${call}-${createHash("sha256").update(`${by} ${outcome} ${(count += 1)}`).digest("hex").slice(0, 8)}`, source: "billing-door", at, what: `billing-${call}`, by, outcome };
    try {
      if (!(await registry.getShop(shopId))) return;
      await registry.recordEvent(shopId, entry);
      if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    } catch {
      // A log that can't be written never hides the answer; the billing service logs every change itself as well.
    }
  }

  /** Runs one call for the shop's owner, logging it either way. */
  function ownerCall(call, run, { secondStep = false } = {}) {
    return async (claims, request) => {
      const person = personOf(claims);
      const { shopId } = body(request);
      if (typeof shopId !== "string" || !shopId) throw new SignupError(400, "Which shop? Open this page from your shop list.");
      if ((await accounts.roleIn(person, shopId)) !== "owner") {
        await log(shopId, call, person.email, "refused");
        throw new SignupError(403, "Only the shop's owner can see or change its plan.");
      }
      // A paid plan's changes need the second step (plan 14.1); looking is free.
      const asked = body(request);
      const problem = (typeof secondStep === "function" ? secondStep(asked) : secondStep) ? ownerTwoStepProblem(claims, await registry.getShop(shopId)) : null;
      if (problem) {
        await log(shopId, call, person.email, "refused: needs two-step sign-in");
        throw new SignupError(problem.status, problem.message);
      }
      try {
        const answer = await run(shopId, body(request));
        await log(shopId, call, person.email, "done");
        return answer;
      } catch (error) {
        await log(shopId, call, person.email, `failed: ${error?.message ?? error}`.slice(0, 200));
        throw error;
      }
    };
  }

  return {
    "POST /api/billing/status": ownerCall("status", async (shopId) => ({ billing: await billing.status(shopId) })),
    "POST /api/billing/card": ownerCall("card", async (shopId) => billing.cardLink({ shopId, returnUrl: billingPage(settings, shopId) }), { secondStep: true }),
    "POST /api/billing/cancel": ownerCall("cancel", async (shopId, { reason, words }) => {
      const row = await billing.cancel({ shopId, reason, words });
      return { cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd) };
    }, { secondStep: true }),
    "POST /api/billing/keep": ownerCall("keep", async (shopId) => {
      const row = await billing.keep({ shopId });
      return { cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd) };
    }),
    "POST /api/billing/change-plan": ownerCall("change-plan", async (shopId, { plan, preview, reason }) => {
      if (preview === true) return { preview: await billing.changePlan({ shopId, plan, preview: true }) };
      const row = await billing.changePlan({ shopId, plan, reason: reason ?? null });
      return { plan: row.plan, changed: row.changed };
    }, { secondStep: (asked) => asked.preview !== true }),
    "POST /api/billing/keep-closing-apps": ownerCall("keep-closing-apps", async (shopId) => {
      const row = await billing.keepClosingApps({ shopId });
      return { plan: row.plan, changed: row.changed };
    }, { secondStep: true }),
    "POST /api/billing/invoices": ownerCall("invoices", async (shopId) => ({ invoices: await billing.invoices(shopId) })),
    ...(paymentWay ? {
      "POST /api/billing/payment-way": ownerCall("payment-way", async (shopId) => {
        const status = await paymentWay.status(shopId);
        return { view: paymentWayView(status, settings), status };
      }),
      "POST /api/billing/payment-way/switch": ownerCall("payment-way-switch", async (shopId, { to }) => {
        const { changed, ...status } = await paymentWay.switchPaymentWay({ shopId, to });
        return { view: paymentWayView(status, settings), status, changed };
      }, { secondStep: true }),
    } : {}),
  };
}

/**
 * The one call reached with no sign-in: "Keep it" from the reminder email's one-time link (/account/keep.html). The
 * link is the proof, checked by the billing service (closedApps.js keepLinkProblem): once, this closing only, until
 * the app closes, and nothing but keeping the closing app. It is held to a per-network limit (signup/limits.js).
 *
 *   POST /api/billing/keep-by-link  { shopId, token } -> { plan, changed }
 */
export const billingPublicRoutes = ({ billing }) => ({
  "POST /api/billing/keep-by-link": async (request) => {
    const { shopId, token } = request.body && typeof request.body === "object" ? request.body : {};
    if (typeof shopId !== "string" || !shopId || typeof token !== "string" || !token) {
      throw new SignupError(400, "This link is missing a part. Sign in and open Plan & billing to keep it.");
    }
    const row = await billing.keepClosingAppsByLink({ shopId, token });
    return { plan: row.plan, changed: row.changed };
  },
});
