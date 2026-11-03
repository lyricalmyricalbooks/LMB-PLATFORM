// The six-digit sign-in code (code plan 18.3, the front door's only email sign-in, signup/frontDoor.js). A code is sent
// to the address and works for ten minutes. Only a salted hash of each code is stored, never the code.
//
// Limits, all per address and all checked and written in one step (the store's `update` is a transaction), so requests
// sent at the same moment can't slip past them:
//   - at most CODES_PER_HOUR codes sent an hour;
//   - at most WRONG_PER_HOUR wrong codes an hour, across every code; after that no code works until the hour has passed.
//
// A new code doesn't cancel the earlier ones still within their ten minutes: every code in the person's inbox works, so
// someone asking for codes for another person's address can't make the email that person is reading stop working.
// A code that works signs the person in and clears every waiting code. The answer to a wrong code is the same whether
// or not any code is waiting, so it never tells whether an address asked for one.
//
// Clients passed in:
//   store     update(key, change) -> what `change` returned; `change(row | null)` gives back { row, result } and
//             `row` is written in the same transaction (null writes nothing)
//   sendEmail async ({ to, code }) -> void (the platform's own email service; the code is never logged)
//   now       () -> Date
//   random    () -> number in [0, 1), for tests only; codes otherwise come from the crypto random source
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_MINUTES = 10;
export const CODES_PER_HOUR = 5;
export const WRONG_PER_HOUR = 10;

const HOUR = 3_600_000;
export const NO_MATCH = "That code didn't match. Check it, or ask for a new one.";
export const TOO_MANY_SENT = "We've sent a few codes already. Check your inbox and spam, or try again in an hour.";
export const TOO_MANY_WRONG = "Too many wrong codes. Wait an hour, or continue with Google.";

const keyOf = (address) => createHash("sha256").update(address).digest("hex").slice(0, 32);
const hashOf = (code, salt) => createHash("sha256").update(`${salt}:${code}`).digest("hex");
const addressOf = (address) => String(address ?? "").trim().toLowerCase();

/** The parts of a row still in force at `at` (ms). */
function current(row, at) {
  return {
    codes: (row?.codes ?? []).filter((c) => Date.parse(c.expiresAt) > at),
    sentAt: (row?.sentAt ?? []).filter((t) => t > at - HOUR),
    wrongAt: (row?.wrongAt ?? []).filter((t) => t > at - HOUR),
  };
}

const matches = (code, entry) => {
  const given = Buffer.from(hashOf(code, entry.salt));
  const want = Buffer.from(entry.hash);
  return given.length === want.length && timingSafeEqual(given, want);
};

export function createSignInCode({ store, sendEmail, now = () => new Date(), random = null }) {
  const digits = () => String(random ? Math.floor(random() * 1_000_000) : randomInt(1_000_000)).padStart(6, "0");
  const plain = (message) => ({ ok: false, message });

  return {
    /** Sends a code. Returns { ok: true } whether or not the address is new, so the page can't tell. */
    async send(address) {
      const to = addressOf(address);
      const code = digits();
      const sent = await store.update(keyOf(to), (row) => {
        const at = now().getTime();
        const kept = current(row, at);
        if (kept.sentAt.length >= CODES_PER_HOUR) return { row: null, result: false };
        const salt = randomBytes(8).toString("hex");
        const entry = { hash: hashOf(code, salt), salt, expiresAt: new Date(at + CODE_MINUTES * 60_000).toISOString() };
        return { row: { ...kept, codes: [...kept.codes, entry], sentAt: [...kept.sentAt, at] }, result: true };
      });
      if (!sent) return plain(TOO_MANY_SENT);
      await sendEmail({ to, code });
      return { ok: true };
    },

    /** Checks a code. Returns { ok: true, address } once; every waiting code is then used up. */
    async check(address, code) {
      const to = addressOf(address);
      const given = String(code ?? "").trim();
      const outcome = await store.update(keyOf(to), (row) => {
        const at = now().getTime();
        const kept = current(row, at);
        if (kept.wrongAt.length >= WRONG_PER_HOUR) return { row: null, result: "locked" };
        // With no code waiting there is nothing to guess, so nothing is counted or written.
        if (!kept.codes.length) return { row: null, result: "wrong" };
        if (kept.codes.some((entry) => matches(given, entry))) return { row: { ...kept, codes: [] }, result: "ok" };
        return { row: { ...kept, wrongAt: [...kept.wrongAt, at] }, result: "wrong" };
      });
      if (outcome === "ok") return { ok: true, address: to };
      return plain(outcome === "locked" ? TOO_MANY_WRONG : NO_MATCH);
    },
  };
}
