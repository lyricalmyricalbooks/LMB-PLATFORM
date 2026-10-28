// The platform's web door for the sign-up and account pages: one handler, hosted later as one function in the platform
// project behind Hosting's /api rewrite. It takes a plain { method, path, headers, body } and returns { status, body },
// so tests need no server. Signed-in calls carry `Authorization: Bearer <Firebase ID token>`; `verifyIdToken` (Firebase
// Admin in the platform project) checks it.
//
//   GET  /api/plans          the plans, prices and trial, for the plan choice (public)
//   POST /api/signin-link    { email, page? }: email a sign-in link back to "signup" or "accounts" (public, rate-limited)
//   POST /api/signup         start the free trial and queue the shop (signed in)
//   GET  /api/signup         the signed-in person's shops in the making (signed in)
//
// Later items add their routes through `routes` (the shop maker's "try again", accounts, invites).
// `onSignedIn(claims, request)` sees every signed-in call (the new-device alerts, accounts/devices.js); a failure there
// is logged and never stops the call.
import { planList } from "../services/billing/plans.js";
import { SignupError } from "./signup.js";

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

export function createApi({ signup, verifyIdToken, settings, routes = {}, onSignedIn, log = console.error }) {
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
    "GET /api/plans": async () => ({
      plans: planList(settings).map(({ plan, name, priceText }) => ({ plan, name, priceText })),
      trialDays: settings.trialDays,
      currency: settings.currency,
      productName: settings.platformName,
    }),
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
