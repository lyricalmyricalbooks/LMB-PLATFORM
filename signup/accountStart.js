// Account-only sign-up (code plan 18.3). This is the new first step of the front door: it makes the press's account
// record and its setup record (signup/pressRecord.js) and nothing else. It does not start the trial, take a card, queue
// a shop or call the shop maker. Those happen only when the press opens its shop (18.8).
//
// Clients passed in:
//   presses   get(pressId) -> record | null; listByOwner(ownerUid) -> records;
//             create(pressId, record) -> true, or false when that id is already taken (never overwrites)
//   now       () -> Date
//   suffix    () -> short random id, for a press whose name is taken
import { createHash } from "node:crypto";
import { SignupError, randomSuffix } from "./signup.js";
import { newPressRecord } from "./pressRecord.js";
import { slugFromPressName } from "./form.js";

export const MAX_SETUP_PRESSES = 5;

export function createAccountStart({ presses, now = () => new Date(), suffix = randomSuffix }) {
  const recordFor = (claims, pressId, pressName) => ({ ...newPressRecord({ pressId, ownerUid: claims.uid, email: claims.email, now: now() }), pressName });
  const atMost = (mine) => {
    if (mine.length >= MAX_SETUP_PRESSES) {
      throw new SignupError(429, `One account can set up up to ${MAX_SETUP_PRESSES} presses. Write to us if you need more.`);
    }
  };

  // The front door makes the record as soon as the code is checked, before any name. Signing in again gives back the
  // person's press (the one in setup, else their first), never a second empty one. A first press gets an id made from
  // the account, so two sign-ins at the same moment (two open tabs) both reach the same record.
  async function nameless(claims, mine) {
    const known = mine.find((p) => p.status === "setup") ?? [...mine].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    if (known) return { pressId: known.pressId, status: known.status };
    const pressId = `press-${createHash("sha256").update(claims.uid).digest("hex").slice(0, 12)}`;
    if (await presses.create(pressId, recordFor(claims, pressId, ""))) return { pressId, status: "setup" };
    const there = await presses.get(pressId);
    if (there?.ownerUid === claims.uid) return { pressId, status: there.status };
    throw new SignupError(503, "We couldn't save your press just now. Try again in a minute.");
  }

  return {
    /** Makes (or finds, when the same press is started again) the setup record. Returns { pressId, status }. */
    async start(claims, input = {}) {
      // A sign-in must be confirmed before a press record is made; an unconfirmed address can't own one.
      if (claims?.email_verified !== true || !claims?.uid || !claims?.email) {
        throw new SignupError(403, "Confirm your email address first, then start again.");
      }
      const pressName = String(input.pressName ?? "").trim().slice(0, 120);
      const mine = await presses.listByOwner(claims.uid);
      if (!pressName) return nameless(claims, mine);
      // The same press started again (a double click, a lost answer): the same record comes back.
      const again = mine.find((p) => p.pressName.toLowerCase() === pressName.toLowerCase());
      if (again) return { pressId: again.pressId, status: again.status };
      atMost(mine);
      const base = slugFromPressName(pressName);
      // A press id is 8 to 40 characters, so a short name ("Ink") always gets a suffix. A taken id gets one too, and
      // create() refuses to overwrite, so two presses starting at the same moment can't take each other's record.
      const tries = base.length >= 8 ? [base] : [];
      for (let i = 0; i < 3; i += 1) tries.push(`${base.slice(0, 24)}-${suffix()}`);
      for (const pressId of tries) {
        if (await presses.create(pressId, recordFor(claims, pressId, pressName))) return { pressId, status: "setup" };
      }
      throw new SignupError(503, "We couldn't save your press just now. Try again in a minute.");
    },
  };
}
