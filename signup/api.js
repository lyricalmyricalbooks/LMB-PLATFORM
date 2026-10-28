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
// Later items add their routes through `routes` (the shop maker's "try again", accounts, invites).
// `onSignedIn(claims, request)` sees every signed-in call (the new-device alerts, accounts/devices.js); a failure there
// is logged and never stops the call.
import { planList } from "../services/billing/plans.js";
import { priceText } from "../services/settings.js";
import { currentTermsVersion } from "../terms/terms.js";
import { SignupError } from "./signup.js";
import { LIVE_DEFAULTS, liveSettings } from "./live.js";

/** The plans that have a website, so can be paid for as a share of its sales. */
export const PAY_AS_YOU_SELL_PLANS = Object.freeze(["shop", "both"]);

/** 200 basis points -> "2%", 250 -> "2.5%". */
export const percentText = (basisPoints) => `${(basisPoints / 100).toLocaleString("en-CA", { maximumFractionDigits: 2 })}%`;

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

export function createApi({ signup, verifyIdToken, settings, routes = {}, onSignedIn, live = () => liveSettings(), log = console.error }) {
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
    return claims;
  };

  const table = {
    "GET /api/plans": async () => {
      // The live settings decide what the waitlist page shows (plan 6.1). If they can't be read, sign-up reads as
      // closed and the page stays the waitlist.
      const now = await Promise.resolve().then(live).catch(() => LIVE_DEFAULTS);
      const percentOff = now.foundingOffer?.percentOff ?? 0;
      const basisPoints = now.payAsYouSell?.basisPoints ?? 0;
      return {
        plans: planList(settings).map(({ plan, name, amount, priceText: price }) => ({
          plan,
          name,
          priceText: price,
          ...(percentOff > 0 ? { foundingPriceText: priceText(Math.round((amount * (100 - percentOff)) / 100), settings.currency) } : {}),
          // The second way to pay (6.19 bills it): a share of website sales, never more than the plan's own price.
          // The stockroom alone has no website, so it has none.
          ...(basisPoints > 0 && PAY_AS_YOU_SELL_PLANS.includes(plan) ? { payAsYouSell: { percentText: percentText(basisPoints), capText: price } } : {}),
        })),
        trialDays: settings.trialDays,
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
  };

  return async function handle(request) {
    const route = table[`${request?.method} ${String(request?.path ?? "").replace(/\/+$/, "")}`];
    if (!route) return { status: 404, body: { ok: false, message: "There's nothing here." } };
    try {
      return { status: 200, body: { ok: true, ...(await route(request)) } };
    } catch (error) {
      if (error instanceof SignupError || Number.isInteger(error?.status)) {
        return { status: error.status, body: { ok: false, message: error.message, ...(error.problems ? { problems: error.problems } : {}) } };
      }
      return { status: 500, body: { ok: false, message: "Something went wrong on our side. Try again in a minute." } };
    }
  };
}
