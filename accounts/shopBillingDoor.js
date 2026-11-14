// The billing hub's door from the shop's own admin (code plan 22.3). Shopify keeps a shop's plan and bills inside the
// shop admin (Settings › Plan, Settings › Billing), so Colophon does too: the admin calls the platform directly.
//
//   POST /api/shop-billing/<call>   { shopId, ... }   the same calls as /api/billing/<call> (billingRoutes.js billingCalls)
//   POST /api/shop-billing/download  { shopId }  the owner's copy of everything (given `exports`; services/export)
//   OPTIONS /api/shop-billing/<call>                  the browser's "may I?" before a call from the shop's address
//
// Who is asking: the admin is signed in to the **shop's own** Firebase project, not the platform's, so the sign-in pass
// is checked against that project. The shop is looked up first, and the pass must be made by that shop's own project
// (`aud` = the registry row's projectId): anyone can make a Firebase project and sign themselves in to it with any
// address marked confirmed, so a pass from any other project is refused before its address is even read. Then the
// person is the shop's owner exactly as on the platform (accounts.roleIn: the shop's team, or the registry's
// ownerEmail), with a confirmed email.
//
// The same two-step rule (plan 14.1): on a paid plan, the changes need a pass with a second step. Since 22.6 the shop's
// own sign-in offers one (authenticator codes, set up under Settings › Security), so a refusal answers 403 with
// `twoStep: true`, the hub sends the owner to Settings › Security, and the account page stays a second way.
//
// Calls from the browser carry the pass in the Authorization header, never a cookie, so any address may call (the
// answer is worthless without a pass): the CORS answer is `*` with no credentials. Every call is logged like the
// platform's door, with source "shop-billing-door". Card pages come back to the shop's own admin.
import { billingCallLog, billingCalls, billingPage, needsSecondStep } from "./billingRoutes.js";
import { ownerTwoStepProblem } from "./twoStep.js";
import { errorRef, isOurError } from "../signup/api.js";
import { siteUrlOf } from "../services/domains/names.js";

export const SHOP_BILLING_PREFIX = "/api/shop-billing/";

const CORS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
});

/** The billing page inside the shop's admin, where card pages come back to. */
export const hubPage = (row) => `${siteUrlOf(row)}/admin#settings/billing`;

/** The `aud` of a sign-in pass, read without checking it (only to refuse the wrong project early). */
function audienceOf(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.aud === "string" ? payload.aud : null;
  } catch {
    return null;
  }
}

class DoorError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/**
 * `verifierFor(projectId)` -> async verify(token) -> claims (server/verifyIdToken.js createIdTokenVerifier, one per
 * shop project). `limits` is the platform door's fair-use limits (optional).
 */
export function createShopBillingDoor({ billing, paymentWay = null, exports = null, bankFeed = null, meters = null, accounts, registry, auditLog, settings, verifierFor, limits = null, now = () => new Date(), log = console.error }) {
  const calls = billingCalls({ billing, paymentWay, settings, exports, bankFeed, meters });
  const record = billingCallLog({ registry, auditLog, now, source: "shop-billing-door" });

  async function signedIn(request, row) {
    const header = Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase() === "authorization")?.[1];
    const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
    if (!token) throw new DoorError(401, "Sign in to your shop's admin first.");
    const project = row.projectId ?? row.shopId;
    // The pass must come from this shop's own project: checked before anything else is read from it.
    if (audienceOf(token) !== project) throw new DoorError(403, "Only the shop's owner can see or change its plan.");
    let claims;
    try {
      claims = await verifierFor(project)(token);
    } catch {
      throw new DoorError(401, "Your sign-in has run out. Sign in to your admin again.");
    }
    if (claims.aud !== project) throw new DoorError(403, "Only the shop's owner can see or change its plan.");
    if (!claims.email || claims.email_verified !== true) throw new DoorError(403, "Confirm your email address first, or sign in with Google.");
    return claims;
  }

  async function run(request, call) {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const entry = calls[call];
    if (!entry || request.method !== "POST") throw new DoorError(404, "There's nothing here.");
    if (limits) await limits.beforeCall(`POST ${SHOP_BILLING_PREFIX}${call}`, request);
    const { shopId } = body;
    if (typeof shopId !== "string" || !shopId) throw new DoorError(400, "Which shop? Open this page from your admin.");
    const row = await registry.getShop(shopId);
    if (!row) throw new DoorError(403, "Only the shop's owner can see or change its plan.");
    const claims = await signedIn(request, row);
    if (limits) await limits.signedIn(`POST ${SHOP_BILLING_PREFIX}${call}`, claims, request);
    const email = String(claims.email).toLowerCase();
    const person = { accountId: claims.uid, email, name: "" };
    if ((await accounts.roleIn(person, shopId)) !== "owner") {
      await record(shopId, call, email, "refused");
      throw new DoorError(403, "Only the shop's owner can see or change its plan.");
    }
    const accountPage = billingPage(settings, shopId);
    const problem = needsSecondStep(entry, body) ? ownerTwoStepProblem(claims, row) : null;
    if (problem) {
      await record(shopId, call, email, "refused: needs two-step sign-in");
      throw new DoorError(problem.status, "Your plan is paid, so this change needs two-step sign-in. Turn it on under Settings › Security, then sign in again with your code.", { twoStep: true, accountPage });
    }
    try {
      // The shop's own sign-in names the person by email only: its user ids are the shop project's, not the platform's.
      const answer = await entry.run(shopId, body, { returnUrl: hubPage(row), claims, payer: { email } });
      await record(shopId, call, email, "done");
      // The status says up front which changes will need the account page, so the hub can say so on the button.
      if (call === "status") return { ...answer, accountPage, changesNeedTwoStep: Boolean(ownerTwoStepProblem(claims, row)) };
      return answer;
    } catch (error) {
      await record(shopId, call, email, `failed: ${error?.message ?? error}`.slice(0, 200));
      throw error;
    }
  }

  /** Answers one request under /api/shop-billing/, always with the CORS headers. */
  return async function handle(request) {
    const call = String(request?.path ?? "").replace(/\/+$/, "").slice(SHOP_BILLING_PREFIX.length);
    if (request?.method === "OPTIONS") return { status: 200, body: { ok: true }, headers: CORS };
    try {
      return { status: 200, body: { ok: true, ...(await run(request, call)) }, headers: CORS };
    } catch (error) {
      if (error instanceof DoorError) return { status: error.status, body: { ok: false, message: error.message, ...error.extra }, headers: CORS };
      if (isOurError(error) && error.status < 500) {
        return { status: error.status, body: { ok: false, message: error.message, ...(Number.isInteger(error.retryAfter) ? { retryAfter: error.retryAfter } : {}) }, headers: CORS };
      }
      const ref = errorRef();
      try {
        log(`POST ${request?.path} failed [${ref}]: ${error?.stack ?? error?.message ?? error}`);
      } catch {
        // A broken log never turns a plain answer into a crash.
      }
      // Our own failure with plain words (an export whose email couldn't go, 502) keeps them, as the platform's door does.
      if (isOurError(error)) return { status: error.status, body: { ok: false, ref, message: error.message }, headers: CORS };
      return { status: 500, body: { ok: false, ref, message: `Something went wrong on our side. Try again in a minute. If it keeps happening, tell us this code: ${ref}.` }, headers: CORS };
    }
  };
}
