/**
 * Plain-English words for a failed admin sign-in (Login.tsx). Firebase's own messages
 * ("Firebase: Error (auth/popup-closed-by-user).") are never shown to the owner.
 */
export function loginErrorMessage(err: unknown): string {
  const code = String((err as any)?.code || "");
  const message = String((err as any)?.message || "");
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") {
    return "The Google window was closed before sign-in finished. Press Sign in with Google to try again.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Couldn't reach Google. Check your internet connection, then try again.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many sign-in attempts in a row. Wait a minute, then try again.";
  }
  if (/^Unauthorized/i.test(message)) {
    return "That Google account can't open the admin. Sign in with the shop's own Google account (lyricalmyricalbooks@gmail.com).";
  }
  if (code === "auth/unauthorized-domain") {
    return "Google sign-in isn't switched on for this web address yet. Open the admin from the shop's usual address.";
  }
  return "Couldn't sign in. Please try again in a moment.";
}
