// The platform's web door for the sign-up and account pages: one handler, hosted later as one function in the platform
// project behind Hosting's /api rewrite. It takes a plain { method, path, headers, body } and returns { status, body },
// so tests need no server. Signed-in calls carry `Authorization: Bearer <Firebase ID token>`; `verifyIdToken` (Firebase
// Admin in the platform project) checks it.
//
//   GET  /api/plans          the plans, prices and trial, for the plan choice and the waitlist's pricing (public);
//                            also whether sign-up is open, the founding price and pay as you sell (live settings)
//   POST /api/signup/address { pressName?, address? }: the web address preview, checked as they type (signed in)
//   POST /api/signin-link    { email, page? }: email a sign-in link back to "signup" or "accounts" (public, rate-limited)
//   POST /api/signup         start the free trial and queue the shop (signed in)
//   GET  /api/signup         the signed-in person's shops in the making (signed in)
//
// Later items add their routes through `routes` (the shop maker's "try again", accounts, invites), each called with the
// checked sign-in, and through `publicRoutes`, called with the request alone, for the few a person reaches before they
// are signed in (the front door's sign-in code, frontDoor.js). Both pass the same fair-use limits.
// `onSignedIn(claims, request)` sees every signed-in call (the new-device alerts, accounts/devices.js); a failure there
// is logged and never stops the call.
// `limits` (optional, limits.js createLimits, plan 19.5): fair-use limits per person, per costly call and per network;
// over one the call answers 429 with `retryAfter`. A path may carry a query (`?shopId=…`); it reaches routes as
// `request.query`.
import { planList } from "../services/billing/plans.js";
import { DEFAULT_ALERT_CENTS, examples } from "../services/billing/runningCost.js";
import { priceText } from "../services/settings.js";
import { currentTermsVersion } from "../terms/terms.js";
import { SignupError } from "./signup.js";
import { LIVE_DEFAULTS, liveSettings } from "./live.js";
import { randomBytes } from "node:crypto";

/** The plans that have a website, so can be paid for as a share of its sales. */
import { errorHelp } from "../help/errorHelp.js";
export const PAY_AS_YOU_SELL_PLANS = Object.freeze(["shop", "both"]);

/** The pay-what-you-use words for the pricing page: the fee (with its founding price), example shops, the heads-up. */
export function usageWords(settings, percentOff = 0) {
  const fees = planList(settings).map((p) => p.amount);
  const fee = Math.min(...fees);
  const money = (cents) => priceText(cents, settings.currency);
  return {
    feeText: money(fee),
    sameFee: fees.every((amount) => amount === fee),
    ...(percentOff > 0 ? { foundingFeeText: money(Math.round((fee * (100 - percentOff)) / 100)) } : {}),
    examples: examples(fee).map(({ id, name, line, runningCents, totalCents }) => ({ id, name, line, runningText: money(runningCents), totalText: money(totalCents) })),
    alertText: money(DEFAULT_ALERT_CENTS),
  };
}

/** 200 basis points -> "2%", 250 -> "2.5%". */
export const percentText = (basisPoints) => `${(basisPoints / 100).toLocaleString("en-CA", { maximumFractionDigits: 2 })}%`;

/**
 * Whether an error's message is ours to show a press. Our own errors (SignupError, ControlError, BillingError and the
 * rest) carry a `status` and plain words. An error from Google, Resend or QuickBooks also carries a `status`, but its
 * status is the other service's answer (a 401 there is not "your sign-in ran out") and its words are theirs, so it is
 * marked `fromProvider` and never shown.
 */
export const isOurError = (error) => error instanceof SignupError || (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 && !error?.fromProvider);

/** A short code a press can quote to support, which is also in the log line. */
export const errorRef = () => randomBytes(4).toString("hex");

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

// `plusTax`: whether plan prices are shown "plus tax" (billing's BILLING_TAX), so the plan choices say so only when it is true.
export function createApi({ signup, verifyIdToken, settings, routes = {}, publicRoutes = {}, onSignedIn, limits = null, live = () => liveSettings(), plusTax = false, log = console.error }) {
  const pathOf = (request) => String(request?.path ?? "").split("?")[0].replace(/\/+$/, "");
  const queryOf = (request) => String(request?.path ?? "").split("?")[1] ?? "";
  const routeOf = (request) => `${request?.method} ${pathOf(request)}`;
  const claimsOf = async (request) => {
    const token = header(request.headers, "authorization").replace(/^Bearer\s+/i, "");
    if (!token) throw new SignupError(401, "Sign in first.");
    let claims;
    try {
      claims = await verifyIdToken(token);
    } catch {
      throw new SignupError(401, "Your sign-in has run out. Sign in again.");
    }
    if (onSignedIn) {
      try {
        await onSignedIn(claims, request);
      } catch (error) {
        log(`onSignedIn failed: ${error?.message ?? error}`);
      }
    }
    if (limits) await limits.signedIn(routeOf(request), claims, request);
    return claims;
  };

  const table = {
    "GET /api/plans": async () => {
      // The live settings decide what the waitlist page shows (plan 6.1). If they can't be read, sign-up reads as
      // closed and the page stays the waitlist.
      const now = await Promise.resolve().then(live).catch(() => LIVE_DEFAULTS);
      const percentOff = now.foundingOffer?.percentOff ?? 0;
      const basisPoints = now.payAsYouSell?.basisPoints ?? 0;
      // The fee as the control room last set it (Settings > Platform fee), the same one billing charges.
      const priced = { ...settings, prices: { ...settings.prices, ...(now.prices ?? {}) }, usdPrices: { ...settings.usdPrices, ...(now.usdPrices ?? {}) } };
      return {
        plans: planList(priced).map(({ plan, name, amount, priceText: price }) => ({
          plan,
          name,
          priceText: price,
          ...(percentOff > 0 ? { foundingPriceText: priceText(Math.round((amount * (100 - percentOff)) / 100), settings.currency) } : {}),
          // The second way to pay (6.19 bills it): a share of website sales, never more than the plan's own price.
          // The stockroom alone has no website, so it has none.
          ...(basisPoints > 0 && PAY_AS_YOU_SELL_PLANS.includes(plan) ? { payAsYouSell: { percentText: percentText(basisPoints), capText: price } } : {}),
        })),
        // Pay what you use (10 November 2026): a flat fee (every plan's price, the same by default) plus the month's
        // running cost at cost; three example shops priced the same way, so the page never promises a made-up number.
        usage: usageWords(priced, percentOff),
        trialDays: settings.trialDays,
        plusTax: plusTax === true,
        currency: settings.currency,
        productName: settings.platformName,
        signupOpen: now.signupOpen === true,
        ...(percentOff > 0 ? { foundingOffer: { percentOff, presses: now.foundingOffer.presses } } : {}),
        termsVersion: currentTermsVersion(),
      };
    },
    "POST /api/signup/address": async (request) => signup.checkWebAddress(await claimsOf(request), request.body ?? {}),
    "POST /api/signin-link": async (request) => signup.sendSignInLink({ email: request.body?.email, page: request.body?.page }),
    "POST /api/signup": async (request) => signup.start(await claimsOf(request), request.body ?? {}),
    "GET /api/signup": async (request) => ({ shops: await signup.mine(await claimsOf(request)) }),
    ...Object.fromEntries(Object.entries(routes).map(([route, run]) => [route, async (request) => run(await claimsOf(request), request)])),
    ...publicRoutes,
  };

  return async function handle(request) {
    const route = table[routeOf(request)];
    if (!route) return { status: 404, body: { ok: false, message: "There's nothing here.", ...errorHelp(404) } };
    try {
      if (queryOf(request) && !request.query) request = { ...request, query: Object.fromEntries(new URLSearchParams(queryOf(request))) };
      if (limits) await limits.beforeCall(routeOf(request), request);
      return { status: 200, body: { ok: true, ...(await route(request)) } };
    } catch (error) {
      if (isOurError(error) && error.status < 500) {
        return { status: error.status, body: { ok: false, message: error.message, ...errorHelp(error.status, request?.path), ...(error.problems ? { problems: error.problems } : {}), ...(Number.isInteger(error.retryAfter) ? { retryAfter: error.retryAfter } : {}) } };
      }
      // Anything else is ours to look into: it goes in the log with a code, and the press sees the same code.
      const ref = errorRef();
      try {
        log(`${request?.method} ${request?.path} failed [${ref}]${error?.fromProvider ? ` (${error.fromProvider})` : ""}: ${error?.stack ?? error?.message ?? error}`);
      } catch {
        // A broken log never turns a plain answer into a crash.
      }
      if (isOurError(error)) return { status: error.status, body: { ok: false, message: error.message, ref, ...errorHelp(error.status, request?.path) } };
      return {
        status: error?.fromProvider ? 502 : 500,
        body: { ok: false, ref, ...errorHelp(error?.fromProvider ? 502 : 500, request?.path), message: `Something went wrong on our side. Try again in a minute. If it keeps happening, tell us this code: ${ref}.` },
      };
    }
  };
}
