// The six-digit sign-in code (code plan 18.3, replacing the emailed link on the front door). A code is sent to the
// address, works for ten minutes, and locks after five wrong tries. Only a hash of the code is stored, never the code.
// A person may ask for codes at most five times an hour per address.
//
// Clients passed in:
//   store     get(key) -> { hash, salt, expiresAt, tries, sentAt } | null; set(key, row)
//   sendEmail async ({ to, code }) -> void (the platform's own email service; the code is never logged)
//   now       () -> Date
//   random    () -> number in [0, 1), for tests only; codes otherwise come from the crypto random source
//
// A used, run-out or locked code is cleared but its send times are kept, so the hourly limit can't be reset by
// spending codes.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
export const CODES_PER_HOUR = 5;

const keyOf = (address) => createHash("sha256").update(address).digest("hex").slice(0, 32);
const hashOf = (code, salt) => createHash("sha256").update(`${salt}:${code}`).digest("hex");

export function createSignInCode({ store, sendEmail, now = () => new Date(), random = null }) {
  const digits = () => String(random ? Math.floor(random() * 1_000_000) : randomInt(1_000_000)).padStart(6, "0");
  // Clears the code but keeps when codes were sent.
  const spend = (key, row) => store.set(key, { sentAt: row.sentAt ?? [] });
  const plain = (message) => ({ ok: false, message });

  return {
    /** Sends a code. Returns { ok: true } whether or not the address is new, so the page can't tell. */
    async send(address) {
      const to = String(address ?? "").trim().toLowerCase();
      const key = keyOf(to);
      const row = await store.get(key);
      const at = now();
      const hourAgo = at.getTime() - 3_600_000;
      const recent = (row?.sentAt ?? []).filter((t) => t > hourAgo);
      if (recent.length >= CODES_PER_HOUR) {
        return plain("We've sent a few codes already. Check your inbox and spam, or try again in an hour.");
      }
      const code = digits();
      const salt = randomBytes(8).toString("hex");
      await store.set(key, {
        hash: hashOf(code, salt),
        salt,
        expiresAt: new Date(at.getTime() + CODE_MINUTES * 60_000).toISOString(),
        tries: 0,
        sentAt: [...recent, at.getTime()],
      });
      await sendEmail({ to, code });
      return { ok: true };
    },

    /** Checks a code. Returns { ok: true, address } once; the code is then used up. */
    async check(address, code) {
      const to = String(address ?? "").trim().toLowerCase();
      const key = keyOf(to);
      const row = await store.get(key);
      if (!row?.hash) return plain("That code didn't match. Ask for a new one.");
      if (now() > new Date(row.expiresAt)) {
        await spend(key, row);
        return plain("That code has run out. Ask for a new one.");
      }
      if (row.tries >= CODE_TRIES) {
        await spend(key, row);
        return plain("Too many wrong codes. Ask for a new one.");
      }
      const given = Buffer.from(hashOf(String(code ?? "").trim(), row.salt));
      const want = Buffer.from(row.hash);
      if (given.length === want.length && timingSafeEqual(given, want)) {
        await spend(key, row);
        return { ok: true, address: to };
      }
      await store.set(key, { ...row, tries: row.tries + 1 });
      return plain("That code didn't match. Check it and try again.");
    },
  };
}
