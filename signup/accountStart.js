// Account-only sign-up (code plan 18.3). This is the new first step of the front door: it makes the press's account
// record and its setup record (signup/pressRecord.js) and nothing else. It does not start the trial, take a card, queue
// a shop or call the shop maker. Those happen only when the press opens its shop (18.8).
//
// Clients passed in:
//   presses   get(pressId) -> record | null; set(pressId, record); listByOwner(ownerUid) -> records
//   now       () -> Date
//   suffix    () -> short random id, for a press whose name is taken
import { SignupError, randomSuffix } from "./signup.js";
import { newPressRecord } from "./pressRecord.js";
import { slugFromPressName } from "./form.js";

export const MAX_SETUP_PRESSES = 5;

export function createAccountStart({ presses, now = () => new Date(), suffix = randomSuffix }) {
  return {
    /** Makes (or finds, when the same press is started again) the setup record. Returns { pressId, status }. */
    async start(claims, input = {}) {
      // A sign-in must be confirmed before a press record is made; an unconfirmed address can't own one.
      if (claims?.email_verified !== true || !claims?.uid || !claims?.email) {
        throw new SignupError(403, "Confirm your email address first, then start again.");
      }
      const pressName = String(input.pressName ?? "").trim().slice(0, 120);
      const mine = await presses.listByOwner(claims.uid);
      // The same press started again (a double click, a lost answer): the same record comes back.
      const again = mine.find((p) => pressName && p.pressName.toLowerCase() === pressName.toLowerCase());
      if (again) return { pressId: again.pressId, status: again.status };
      if (mine.length >= MAX_SETUP_PRESSES) {
        throw new SignupError(429, `One account can set up up to ${MAX_SETUP_PRESSES} presses. Write to us if you need more.`);
      }
      let pressId = slugFromPressName(pressName || "press");
      if (await presses.get(pressId)) pressId = `${pressId.slice(0, 24)}-${suffix()}`;
      const record = { ...newPressRecord({ pressId, ownerUid: claims.uid, email: claims.email, now: now() }), pressName };
      await presses.set(pressId, record);
      return { pressId, status: record.status };
    },
  };
}
