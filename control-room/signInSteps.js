// The control room's sign-in in plain words (plan 9.1): Google, then the 6-digit code from the authenticator app.
// Each Firebase failure gets its own message and its own next step, so a wrong code, a code step left too long, a
// closed Google window and a lost connection never all read "That code didn't work" (Julian, 25 November 2026:
// "authenticator app sign in thing is buggy"). Pure functions: app.js shows the words, control-room/signInSteps.test.js
// checks them.

/** The 6 digits from what was typed or pasted ("123 456", "123-456", " 123456 "), or null when it isn't 6 digits. */
export function cleanCode(typed) {
  const digits = String(typed ?? "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

// Firebase codes for a code step that has run out: the Google half must be done again before a code can count.
const STEP_EXPIRED = new Set([
  "auth/code-expired", "auth/missing-multi-factor-session", "auth/invalid-multi-factor-session",
  "auth/multi-factor-info-not-found", "auth/user-token-expired", "auth/session-cookie-expired",
]);

/**
 * What to say when a code is refused, and whether to go back to the Google button:
 * { words, restart } — restart true means the code step itself ran out, not the code.
 */
export function codeProblem(code) {
  if (code === "auth/invalid-verification-code" || code === "auth/invalid-credential") {
    return { words: "That code didn't match. Codes change every 30 seconds: type the one on screen now.", restart: false };
  }
  if (STEP_EXPIRED.has(code)) {
    return { words: "That took a few minutes, so the sign-in timed out. Sign in with Google again, then type a fresh code.", restart: true };
  }
  if (code === "auth/too-many-requests") {
    return { words: "Too many tries in a row. Wait a minute, then type the code on screen.", restart: false };
  }
  if (code === "auth/network-request-failed") {
    return { words: "The internet connection dropped. Check it, then press Sign in again.", restart: false };
  }
  return { words: "That code didn't go through. Type the one on screen now, or start again with Google.", restart: false };
}

/** What to say when the Google window doesn't finish (null: say nothing, the person closed it on purpose). */
export function googleProblem(code) {
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") return null;
  if (code === "auth/popup-blocked") return "Chrome blocked the Google window. Allow pop-ups for this page, or press the button again.";
  if (code === "auth/network-request-failed") return "The internet connection dropped. Check it, then sign in again.";
  if (code === "auth/too-many-requests") return "Too many tries in a row. Wait a minute, then sign in again.";
  if (code === "auth/unauthorized-domain") return "This address isn't allowed to sign in. Open the control room from its usual address.";
  return "Google sign-in didn't finish. Try again.";
}

/**
 * What the sign-in card says when the room refused a signed-in person (the server's message from load()), or null when
 * the message isn't about signing in. `enrolled` is whether the person already has an authenticator app.
 *   { show: "setup" }                 no authenticator yet: show the set-up screen
 *   { show: "signin", words }         sign in again (ran out after 12 hours, or signed in without the code)
 */
export function roomRefusal(message, enrolled) {
  const text = String(message ?? "");
  if (/two-step/i.test(text)) {
    return enrolled
      ? { show: "signin", words: "Sign in with Google again and type the code from your authenticator app." }
      : { show: "setup" };
  }
  if (/hours old/i.test(text)) return { show: "signin", words: "Your sign-in ran out after 12 hours, to keep the room safe. Sign in again." };
  if (/platform admins only/i.test(text)) return { show: "signin", words: "That Google account isn't a control-room account. Sign in with the platform owner's account." };
  return null;
}
