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
//   POST /api/billing/keep-closing-apps  { shopId } -> { plan, changed }: keep an app the last plan change is closing
//   POST /api/billing/change-plan  { shopId, plan, preview?, reason? } -> { preview } or { plan, changed }: what changes
//                                  and the prorated amount (preview: true, nothing changes), or the change itself, with
//                                  the optional answer to "why are you dropping it?" (closedApps.js DROP_REASONS)
//   POST /api/billing/cost-alert  { shopId, cents } -> { costAlert }: email me when a month's bill may pass this amount
//   POST /api/billing/email-language  { shopId, language: "fr" | "en" | "auto" } -> { changed, emailLanguage }: the
//                                  language of the platform's emails, for every shop the account pays for
//   POST /api/billing/invoices     { shopId, after? } -> { invoices, more, after }: newest first, each with Stripe's PDF link
//   POST /api/billing/payment-way  { shopId } -> { view, status }: how the shop pays (monthly or pay as you sell, 6.19)
//   POST /api/billing/payment-way/switch  { shopId, to } -> { view, status, changed }: switch from the next month (at
//                                  once during the trial); only when the door is given `paymentWay`
//   The billing hub's calls (code plan 22.2), when the billing service has them:
//   POST /api/billing/payment-methods          { shopId } -> { cards }: saved cards, the primary one first
//   POST /api/billing/payment-methods/primary  { shopId, cardId } -> { changed }: this card pays the plan from now on
//   POST /api/billing/payment-methods/remove   { shopId, cardId } -> { removed }: a card that pays nothing
//   POST /api/billing/details                  { shopId } -> { details }: name, email for bills, address, tax number
//   POST /api/billing/details/save             { shopId, name, email, address, taxNumber } -> { saved }
//   POST /api/billing/upcoming                 { shopId } -> { bill }: the next bill line by line, or null
//   POST /api/billing/pay-now                  { shopId } -> { paid } or { needsConfirming, url }
//   The download, when the door is given `exports` (the shop admin's door; the account page has its own button):
//   POST /api/billing/download                 { shopId } -> { emailedTo, expiresAt }: a copy of everything, the
//                                  closed app's records included while they're kept (services/export forOwner: once a day)
//
// The same calls are reached from the shop's own admin through accounts/shopBillingDoor.js (`/api/shop-billing/*`):
// `billingCalls` below is the one list both doors serve.
//
// Each call reaches the billing service (services/billing) once; the page asks for the status again after a change.
// The door never reads Stripe itself.
import { createHash } from "node:crypto";
import { personOf, SignupError } from "../signup/signup.js";
import { paymentWayView } from "../services/billing/paymentWay.js";
import { planEnding } from "../services/billing/paymentWayState.js";
import { BillingError } from "../services/billing/billing.js";
import { ownerTwoStepProblem } from "./twoStep.js";

/** This shop's Plan & billing page: the one place a card page may send people back to. */
export const billingPage = (settings, shopId) => `${settings.platformUrl}/account/billing?shop=${encodeURIComponent(shopId)}`;

/**
 * Every billing call, by name, for both doors: { run(shopId, body, { returnUrl }), secondStep }. `secondStep` (true, or
 * a test of the body) marks the changes a paid plan's owner needs two-step sign-in for (plan 14.1); looking is free.
 */
export function billingCalls({ billing, paymentWay = null, settings, exports = null }) {
  // The card and the billing details are the paying account's (one Stripe customer for every shop it pays for), so only
  // that person changes them: a co-owner's card would otherwise pay the account holder's other shops too.
  const payerOnly = (run) => async (shopId, body, context) => {
    if (typeof billing.paidBy === "function" && !(await billing.paidBy(shopId, context?.payer ?? {}))) {
      throw new BillingError(403, "Only the person whose account pays for this plan can change its card or billing details. Ask them to sign in and do it.");
    }
    return run(shopId, body, context);
  };
  const calls = {
    status: { run: async (shopId) => ({ billing: await billing.status(shopId) }) },
    "email-language": { run: async (shopId, { language }) => billing.setEmailLanguage({ shopId, language }) },
    // Pay what you use: the amount a month's bill may pass before the press is emailed (0 turns the email off).
    "cost-alert": { run: async (shopId, { cents }) => billing.setCostAlert({ shopId, cents }) },
    card: { run: payerOnly(async (shopId, _body, { returnUrl }) => billing.cardLink({ shopId, returnUrl })), secondStep: true },
    cancel: {
      run: async (shopId, { reason, words }) => ({ cancelAtPeriodEnd: planEnding(await billing.cancel({ shopId, reason, words })).cancelling }),
      secondStep: true,
    },
    keep: { run: async (shopId) => ({ cancelAtPeriodEnd: planEnding(await billing.keep({ shopId })).cancelling }) },
    "change-plan": {
      run: async (shopId, { plan, preview, reason }) => {
        // One plan for every shop (10 November 2026): the only move a press can make is an older plan's move to it.
        if (plan !== "both") throw new BillingError(400, "Every shop has the website and the stockroom now, so there's no plan to choose.");
        if (preview === true) return { preview: await billing.changePlan({ shopId, plan, preview: true }) };
        const row = await billing.changePlan({ shopId, plan, reason: reason ?? null });
        return { plan: row.plan, changed: row.changed };
      },
      secondStep: (asked) => asked.preview !== true,
    },
    // Changed their mind about an app that's closing: the plan goes back to one with every app open now (#292).
    "keep-closing-apps": {
      run: async (shopId) => { const row = await billing.keepClosingApps({ shopId }); return { plan: row.plan, changed: row.changed }; },
      secondStep: true,
    },
    // A page of bills, newest first; `after` (the last page's) reads older ones.
    invoices: { run: async (shopId, { after }) => (billing.invoicePage ? billing.invoicePage(shopId, { after: typeof after === "string" ? after : null }) : { invoices: await billing.invoices(shopId), more: false, after: null }) },
  };
  if (paymentWay) {
    calls["payment-way"] = { run: async (shopId) => { const status = await paymentWay.status(shopId); return { view: paymentWayView(status, settings), status }; } };
    calls["payment-way/switch"] = {
      run: async (shopId, { to }) => {
        const { changed, ...status } = await paymentWay.switchPaymentWay({ shopId, to });
        return { view: paymentWayView(status, settings), status, changed };
      },
      secondStep: true,
    };
  }
  if (typeof billing.paymentMethods === "function") {
    const cardId = (body) => (typeof body.cardId === "string" ? body.cardId : "");
    Object.assign(calls, {
      "payment-methods": { run: async (shopId) => billing.paymentMethods(shopId) },
      "payment-methods/primary": { run: payerOnly(async (shopId, body) => billing.makePrimary({ shopId, cardId: cardId(body) })), secondStep: true },
      "payment-methods/remove": { run: payerOnly(async (shopId, body) => billing.removeCard({ shopId, cardId: cardId(body) })), secondStep: true },
      details: { run: async (shopId) => ({ details: await billing.billingDetails(shopId) }) },
      "details/save": { run: payerOnly(async (shopId, { name, email, address, taxNumber }) => billing.saveBillingDetails({ shopId, name, email, address, taxNumber })), secondStep: true },
      upcoming: { run: async (shopId) => ({ bill: await billing.upcomingBill(shopId) }) },
      "pay-now": { run: async (shopId) => billing.payNow({ shopId }) },
    });
  }
  if (exports) {
    // The same once-a-day copy as the account page's Download all your data, emailed to the shop's owner.
    calls.download = { run: async (shopId, _body, { claims }) => { const { emailedTo, expiresAt } = await exports.forOwner(claims, { shopId }); return { emailedTo, expiresAt }; } };
  }
  return calls;
}

/** Does this call, with this body, need the second step? */
export const needsSecondStep = (entry, asked) => (typeof entry.secondStep === "function" ? entry.secondStep(asked) : Boolean(entry.secondStep));

/** A log of each billing call, done or refused, in the registry and the shop's audit log. */
export function billingCallLog({ registry, auditLog, now, source = "billing-door" }) {
  let count = 0;
  return async function log(shopId, call, by, outcome) {
    const at = now().toISOString();
    const entry = { id: `${source}-${at}-${call.replace(/\//g, "-")}-${createHash("sha256").update(`${by} ${outcome} ${(count += 1)}`).digest("hex").slice(0, 8)}`, source, at, what: `billing-${call.replace(/\//g, "-")}`, by, outcome };
    try {
      if (!(await registry.getShop(shopId))) return;
      await registry.recordEvent(shopId, entry);
      if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    } catch {
      // A log that can't be written never hides the answer; the billing service logs every change itself as well.
    }
  };
}

export function billingRoutes({ billing, paymentWay = null, accounts, registry, auditLog, settings, now = () => new Date() }) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  const log = billingCallLog({ registry, auditLog, now });

  /** Runs one call for the shop's owner, logging it either way. */
  function ownerCall(call, entry) {
    return async (claims, request) => {
      const person = personOf(claims);
      const asked = body(request);
      const { shopId } = asked;
      if (typeof shopId !== "string" || !shopId) throw new SignupError(400, "Which shop? Open this page from your shop list.");
      if ((await accounts.roleIn(person, shopId)) !== "owner") {
        await log(shopId, call, person.email, "refused");
        throw new SignupError(403, "Only the shop's owner can see or change its plan.");
      }
      // A paid plan's changes need the second step (plan 14.1); looking is free.
      const problem = needsSecondStep(entry, asked) ? ownerTwoStepProblem(claims, await registry.getShop(shopId)) : null;
      if (problem) {
        await log(shopId, call, person.email, "refused: needs two-step sign-in");
        throw new SignupError(problem.status, problem.message);
      }
      try {
        const answer = await entry.run(shopId, asked, { returnUrl: billingPage(settings, shopId), claims, payer: { accountId: person.accountId, email: person.email } });
        await log(shopId, call, person.email, "done");
        return answer;
      } catch (error) {
        await log(shopId, call, person.email, `failed: ${error?.message ?? error}`.slice(0, 200));
        throw error;
      }
    };
  }

  return Object.fromEntries(Object.entries(billingCalls({ billing, paymentWay, settings })).map(([call, entry]) => [`POST /api/billing/${call}`, ownerCall(call, entry)]));
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
