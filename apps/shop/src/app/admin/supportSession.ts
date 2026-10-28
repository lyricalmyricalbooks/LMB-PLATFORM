// Platform support ("act as this shop" in the platform's control room). The platform logs the visit in this shop's
// audit log, then opens the admin at #support=<sign-in token>. The admin signs in with it, clears the address, and
// shows who is signed in, why and until when; at that time it signs out. A "view" visit (the default, plan 9.8) only
// looks: the server and rules refuse its changes. An "edit" visit has staff access. Both check the same time
// (functions/roles.js supportOf, isSupport() and isSupportViewer() in the rules).
import { signInWithCustomToken, signOut, type Auth } from "firebase/auth";

export type SupportVisit = { by: string; reason: string; until: number; mode: "view" | "edit" };

/** The support sign-in token in an address hash (`#support=…`), or null. */
export function supportTokenFromHash(hash: string): string | null {
  const match = /^#?support=([A-Za-z0-9._-]+)$/.exec(hash || "");
  return match ? match[1] : null;
}

/** The support visit on a sign-in pass while it lasts (`until` in seconds), else null. Same check as the server. */
export function supportOf(claims: Record<string, any> | null | undefined, nowMs = Date.now()): SupportVisit | null {
  const support = claims?.support;
  if (claims?.firebase?.sign_in_provider !== "custom" || !support || typeof support !== "object") return null;
  if (typeof support.until !== "number" || support.until * 1000 <= nowMs) return null;
  return { by: String(support.by ?? ""), reason: String(support.reason ?? ""), until: support.until, mode: support.mode === "edit" ? "edit" : "view" };
}

/**
 * Signs in with a support token in the address, if there is one, and takes it out of the address first so it is
 * never bookmarked or shared. Resolves true when it signed in. A token that has run out leaves the admin signed out.
 */
export async function startSupportVisit(auth: Auth, location: Pick<Location, "hash" | "pathname" | "search"> = window.location,
  replace: (url: string) => void = (url) => window.history.replaceState(null, "", url)): Promise<boolean> {
  const token = supportTokenFromHash(location.hash);
  if (!token) return false;
  replace(location.pathname + location.search);
  try {
    await signOut(auth);
    await signInWithCustomToken(auth, token);
    return true;
  } catch {
    return false;
  }
}
