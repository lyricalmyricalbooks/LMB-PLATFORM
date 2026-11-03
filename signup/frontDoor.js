// The front door's server side (code plan 18.4, the five-screen flow in docs/plans/1-front-door-v2.md): email, the
// six-digit code, three questions, then the admin. One sign-in path for new and returning presses.
//
//   POST /api/code/send   { email }            emails a six-digit code (public; the same answer for any address)
//   POST /api/code/check  { email, code }      checks it; on a match, answers { link }: a one-time Firebase sign-in
//                                              link for that address, which the page signs in with at once
//                                              (signInWithEmailLink). The link is never emailed: the code was the proof.
//   POST /api/press       {}                   makes the press's setup record, or gives back the one still in setup
//   GET  /api/press                            the signed-in person's presses
//   POST /api/press/setup { pressId, plan?, pressName?, sells?, country?, look?, adminLook? }
//                                              saves answers while the press is in setup
//
// Nothing here starts a trial, takes a card or makes a shop: those wait for Open my shop (18.8).
//
// Clients passed in:
//   presses   get(pressId); create(pressId, record) -> bool; listByOwner(ownerUid);
//             update(pressId, change) -> change's result, read and written in one transaction
//   codes     the sign-in code store (signInCode.js): get(key); set(key, row)
//   email     sendPlatform({ kind, to, data, idempotencyKey })
//   auth      signInLink(email, { url }) -> link (clients/signInLinks.js in the platform project)
//   settings  { platformUrl }
import { createHash, randomBytes } from "node:crypto";
import { SignupError, randomSuffix } from "./signup.js";
import { createSignInCode } from "./signInCode.js";
import { createAccountStart } from "./accountStart.js";
import { setupChange } from "./pressRecord.js";
import { COUNTRIES, PUBLISHES, isEmail } from "./form.js";

/** The page the front door lives on, under the platform's address. */
export const START_PAGE = "join";

/** What a press sees of its own record: never the owner's uid or the platform's own fields. */
const shown = (record) => ({
  pressId: record.pressId, status: record.status, plan: record.plan ?? "", pressName: record.pressName, sells: record.sells, country: record.country,
  look: record.look ?? "", adminLook: record.adminLook ?? "",
});

export function createFrontDoor({ presses, codes, email, auth, settings, now = () => new Date(), suffix = randomSuffix, random = null }) {
  const signInCode = createSignInCode({
    store: codes,
    now,
    random,
    // Each code is its own email: a new code replaces the stored one, so its email must never be skipped as a repeat.
    sendEmail: ({ to, code }) => email.sendPlatform({
      kind: "sign-in-code",
      to,
      data: { code },
      idempotencyKey: `signin-code/${createHash("sha256").update(to).digest("hex").slice(0, 32)}/${now().toISOString()}/${randomBytes(4).toString("hex")}`,
    }),
  });
  const accountStart = createAccountStart({ presses, now, suffix });

  const addressOf = (value) => {
    if (!isEmail(value)) throw new SignupError(400, "Enter your email address.", { email: "Enter your email address." });
    return value.trim().toLowerCase();
  };

  async function ownPress(claims, pressId) {
    const record = typeof pressId === "string" && pressId ? await presses.get(pressId) : null;
    // Someone else's press reads the same as no press, so ids can't be probed.
    if (!record || record.ownerUid !== claims?.uid) throw new SignupError(404, "We couldn't find that press.");
    return record;
  }

  return {
    async sendCode(body = {}) {
      const to = addressOf(body.email);
      const sent = await signInCode.send(to);
      if (!sent.ok) throw new SignupError(429, sent.message);
      return {};
    },

    async checkCode(body = {}) {
      const to = addressOf(body.email);
      const code = String(body.code ?? "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) throw new SignupError(400, "Enter the six numbers from the email.", { code: "Enter the six numbers from the email." });
      const checked = await signInCode.check(to, code);
      if (!checked.ok) throw new SignupError(400, checked.message, { code: checked.message });
      const link = await auth.signInLink(to, { url: `${settings.platformUrl}/${START_PAGE}/?finish=1` });
      return { link };
    },

    async startPress(claims) {
      const { pressId } = await accountStart.start(claims, {});
      return { press: shown(await presses.get(pressId)) };
    },

    async myPresses(claims) {
      if (!claims?.uid) throw new SignupError(401, "Sign in first.");
      const mine = await presses.listByOwner(claims.uid);
      return { presses: mine.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(shown) };
    },

    async saveSetup(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      const change = {};
      for (const key of ["plan", "pressName", "sells", "country", "look", "adminLook"]) if (key in body) change[key] = body[key];
      // The choices on the page are the only answers taken; an empty answer is a skipped question.
      if (typeof change.sells === "string" && change.sells && !PUBLISHES.options.some((o) => o.id === change.sells)) {
        throw new SignupError(400, "Pick one of the choices.", { sells: "Pick one of the choices." });
      }
      if (typeof change.country === "string" && change.country && !(change.country in COUNTRIES)) {
        throw new SignupError(400, "Pick your country from the list.", { country: "Pick your country from the list." });
      }
      // Read and written in one step, so a save can never put back a status the platform has just moved on.
      const saved = await presses.update(record.pressId, (current) => {
        if (!current || current.ownerUid !== claims.uid) return { row: null, result: { ok: false, status: 404, message: "We couldn't find that press." } };
        const checked = setupChange(current, change);
        if (!checked.ok) return { row: null, result: { ...checked, status: 409 } };
        const updated = { ...current, ...checked.fields, lastSeenAt: now().toISOString() };
        return { row: updated, result: { ok: true, press: shown(updated) } };
      });
      if (!saved.ok) throw new SignupError(saved.status, saved.message);
      return { press: saved.press };
    },
  };
}

/** The routes anyone may call: sending and checking a code. */
export const frontDoorPublicRoutes = (door) => ({
  "POST /api/code/send": (request) => door.sendCode(request.body ?? {}),
  "POST /api/code/check": (request) => door.checkCode(request.body ?? {}),
});

/** The signed-in routes: the press's setup record. */
export const frontDoorRoutes = (door) => ({
  "POST /api/press": (claims) => door.startPress(claims),
  "GET /api/press": (claims) => door.myPresses(claims),
  "POST /api/press/setup": (claims, request) => door.saveSetup(claims, request.body ?? {}),
});
