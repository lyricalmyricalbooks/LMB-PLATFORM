// New-device alerts (plan 4.5): when a platform account is used from a device it hasn't been used from before, its
// owner gets an email, so a stolen sign-in is noticed. The platform's pages keep a random device id in the browser
// (`X-Device-Id`, made once per browser); the web door (signup/api.js `onSignedIn`) passes every signed-in call here.
//
// - The very first device an account is used from (sign-up) is remembered without an email: there is nothing to warn
//   about yet.
// - The device id is kept only as a hash, with the browser's name in plain words and when it was first and last seen.
// - A call without a device id counts as a device of its own ("no device id"), so leaving the header off doesn't hide a
//   sign-in.
// - One email per new device, ever (the email service's idempotency key), even if the first calls race.
// - At most MAX_DEVICES are remembered; the one unseen longest is forgotten first, so a returning old device alerts again.
//
//   deviceWatch({ devices, email, now }) -> seen(claims, request)
//   devices: get(accountId) -> { known: { <hash>: { firstSeenAt, lastSeenAt, browser } } } | null; set(accountId, row)
import { createHash } from "node:crypto";

export const MAX_DEVICES = 50;
// Last-seen times are written at most this often per device, so every call isn't a write.
export const TOUCH_MINUTES = 60;

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

/** The browser and system in plain words, from the user agent ("Firefox on Windows"). Never the full string. */
export function browserWords(agent) {
  const a = String(agent ?? "");
  const browser = /Edg\//.test(a) ? "Edge" : /OPR\//.test(a) ? "Opera" : /Firefox\//.test(a) ? "Firefox" : /Chrome\//.test(a) ? "Chrome" : /Safari\//.test(a) ? "Safari" : "A browser";
  const system = /iPhone|iPad/.test(a) ? "iPhone or iPad" : /Android/.test(a) ? "Android" : /Mac OS X/.test(a) ? "Mac" : /Windows/.test(a) ? "Windows" : /Linux/.test(a) ? "Linux" : "";
  return system ? `${browser} on ${system}` : browser;
}

export function deviceWatch({ devices, email, now = () => new Date() }) {
  return async function seen(claims, request) {
    if (!claims?.uid || !claims.email || claims.email_verified !== true) return { known: false };
    const raw = header(request?.headers, "x-device-id");
    const id = /^[A-Za-z0-9-]{16,64}$/.test(raw) ? raw : "no-device-id";
    const key = createHash("sha256").update(`${claims.uid} ${id}`).digest("hex").slice(0, 32);
    const at = now().toISOString();
    const row = (await devices.get(claims.uid)) ?? { known: {} };
    const known = row.known ?? {};
    const browser = browserWords(header(request?.headers, "user-agent"));

    if (known[key]) {
      if ((Date.parse(at) - Date.parse(known[key].lastSeenAt)) / 60_000 >= TOUCH_MINUTES) {
        known[key] = { ...known[key], lastSeenAt: at };
        await devices.set(claims.uid, { ...row, known });
      }
      return { known: true };
    }

    const first = Object.keys(known).length === 0;
    known[key] = { firstSeenAt: at, lastSeenAt: at, browser };
    const kept = Object.entries(known).sort(([, a], [, b]) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1)).slice(0, MAX_DEVICES);
    await devices.set(claims.uid, { ...row, known: Object.fromEntries(kept) });
    if (!first) {
      await email.sendPlatform({
        kind: "new-device", to: String(claims.email).toLowerCase(), idempotencyKey: `new-device-${claims.uid}-${key}`,
        data: { browser, at },
      });
    }
    return { known: false, alerted: !first };
  };
}
