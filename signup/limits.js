// Fair-use limits on the platform's whole web door (code plan 19.5, signup/api.js `limits`). Built on the same throttle
// store as the sign-in links (signup.js): `count(key, sinceIso) -> number` and `add(key, atIso)`.
//
//   every signed-in call      120 a minute per signed-in person (claims.uid); control-room admins (on the admin list,
//                             signed in with two steps, controlRoom.js adminOf) are not held to it
//   costly calls              10 per 10 minutes per person, admins included: Try again on the shop maker, the
//                             control room's Check now and Google's run again, and a card page from Plan & billing
//   GET /api/plans            300 a minute per network (cheap, but public)
//   POST /api/signin-link     20 an hour per network, on top of the 5 an hour per address it already has
//   POST /api/code/send       the same, for the front door's six-digit code (frontDoor.js)
//   POST /api/code/check      60 an hour per network, on top of 5 tries per code: guessing codes across many
//                             addresses from one network stops here
//
// The network is read from the right of `x-forwarded-for`: each proxy adds the address it was called from at the end,
// and anything to the left can be written by the caller, so the left-most entry is never trusted. `proxyHops` is how
// many of our own proxies add an entry after the caller's (0: the right-most entry is the caller). Check the hosted
// header once at go-live (15.6) and set it to match. With no header, `request.ip`. Keys are hashed, so the store never holds an address or a person's id in the clear. Over a limit the call answers 429 with
// plain words and `retryAfter` (seconds). Refused calls aren't counted, so waiting is always enough.
//
// If the store can't be read or written the call goes through and the failure is logged: a broken counter must never
// lock everyone out.
import { createHash } from "node:crypto";
import { adminOf } from "../control-room/controlRoom.js";

export const TOO_FAST = "You're going a bit fast. Wait a minute and try again.";

const MINUTE = 60_000;

/** The limits: how many calls in how long. */
export const DEFAULT_LIMITS = Object.freeze({
  person: Object.freeze({ max: 120, windowMs: MINUTE }),
  costly: Object.freeze({ max: 10, windowMs: 10 * MINUTE }),
  plans: Object.freeze({ max: 300, windowMs: MINUTE }),
  signinLink: Object.freeze({ max: 20, windowMs: 60 * MINUTE }),
  codeCheck: Object.freeze({ max: 60, windowMs: 60 * MINUTE }),
});

/** Calls that cost something real (a setup run, a round of checks, a card page): held to `costly` per person. */
export const COSTLY_ROUTES = Object.freeze([
  "POST /api/signup/retry",
  "POST /api/control/check",
  "POST /api/control/google-run-again",
  "POST /api/billing/card",
]);

/** Public calls held to a per-network limit, by route. */
export const NETWORK_ROUTES = Object.freeze({
  "GET /api/plans": "plans",
  "POST /api/signin-link": "signinLink",
  "POST /api/code/send": "signinLink",
  "POST /api/code/check": "codeCheck",
});

export class LimitError extends Error {
  constructor(retryAfter) {
    super(TOO_FAST);
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

/**
 * The caller's network: the `x-forwarded-for` entry `proxyHops` from the right (the caller can't write it), else
 * `request.ip`, else "unknown".
 */
export function networkOf(request, { proxyHops = 0 } = {}) {
  const entries = header(request?.headers, "x-forwarded-for").split(",").map((entry) => entry.trim()).filter(Boolean);
  const forwarded = entries[Math.max(0, entries.length - 1 - proxyHops)];
  if (forwarded) return forwarded.slice(0, 100);
  return typeof request?.ip === "string" && request.ip ? request.ip.slice(0, 100) : "unknown";
}

const hashed = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 32);

/**
 * The limiter. `throttle` is the store; `admins` the control room's admin list (controlRoomAdmins); `limits` and
 * `costly` change the numbers and the costly calls (the walkthrough is generous).
 */
export function createLimits({ throttle, admins = [], limits = DEFAULT_LIMITS, costly = COSTLY_ROUTES, proxyHops = 0, now = () => new Date(), log = console.error }) {
  const isAdmin = (claims) => {
    try {
      adminOf(claims, admins, now().getTime());
      return true;
    } catch {
      return false;
    }
  };

  // One limit: refuses when the window is full, else counts this call. A store that fails lets the call through.
  async function take(kind, who) {
    const { max, windowMs } = limits[kind] ?? DEFAULT_LIMITS[kind];
    const key = `limit/${kind}/${hashed(who)}`;
    const nowMs = now().getTime();
    const since = new Date(nowMs - windowMs).toISOString();
    const at = new Date(nowMs).toISOString();
    try {
      // Count and add in one step where the store can, so calls sent at the same moment can't all pass the count.
      const added = throttle.addIfUnder
        ? await throttle.addIfUnder(key, since, at, max)
        : (await throttle.count(key, since)) < max && (await throttle.add(key, at), true);
      if (!added) throw new LimitError(Math.ceil(windowMs / 1000));
    } catch (error) {
      if (error instanceof LimitError) throw error;
      log(`The fair-use counter couldn't be read or written (${error?.message ?? error}); the call went through.`);
    }
  }

  return {
    /** Before any call: the per-network limit of a public call. */
    async beforeCall(route, request) {
      const kind = NETWORK_ROUTES[route];
      if (kind) await take(kind, `${route} ${networkOf(request, { proxyHops })}`);
    },

    /** Once a signed-in call's person is known: their per-minute limit (not for admins), then a costly call's own. */
    async signedIn(route, claims) {
      const uid = String(claims?.uid ?? "");
      if (!uid) return;
      if (!isAdmin(claims)) await take("person", uid);
      if (costly.includes(route)) await take("costly", `${route} ${uid}`);
    },
  };
}
