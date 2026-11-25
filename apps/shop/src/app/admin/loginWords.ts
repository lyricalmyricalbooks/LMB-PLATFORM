// The sign-in screen's words (12 November 2026). Nobody is signed in yet, so what the shop sells comes from the public
// settings (`settings/website.sells`): a shop that doesn't sell books isn't called a publishing house.
import { sellsBooks, wordsFor } from "../../shared/shopSells";

/** The invited address from an invite link (`/admin?invite=<email>`, functions/teamInvite.js inviteLink), or "". */
export function invitedEmail(search: string): string {
  try {
    const value = new URLSearchParams(search).get("invite")?.trim().toLowerCase() || "";
    return /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(value) && value.length <= 254 ? value : "";
  } catch { return ""; }
}

export function loginWords(sells?: string | null, emailCode = false): { sub: string; lede: string } {
  return {
    sub: sellsBooks(sells) ? "Publishing House · Admin" : "Shop · Admin",
    // With an emailed code on offer, Google is one of two ways in, so the line doesn't name it.
    lede: wordsFor(sells)(emailCode ? "Sign in to manage books, orders and settings." : "Sign in with the shop's Google account to manage books, orders and settings."),
  };
}

/**
 * "Email me a sign-in code" (sign-up plan move 3, 25 November 2026): Colophon's sign-in page (join/), which signs a person
 * in with an emailed six-digit code and then opens this shop's admin already signed in (accounts/shopSignIn.js). Empty when the
 * shop doesn't know Colophon's address (older profiles): the page then offers Google only, as before.
 */
export function emailCodeLink(profile: { platformUrl?: string; shopId: string }): string {
  if (!profile.platformUrl || !/^https:\/\/[^/\s]+$/.test(profile.platformUrl)) return "";
  return `${profile.platformUrl}/join/?${new URLSearchParams({ open: profile.shopId })}`;
}
