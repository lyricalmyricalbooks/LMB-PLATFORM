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

export function loginWords(sells?: string | null): { sub: string; lede: string } {
  return {
    sub: sellsBooks(sells) ? "Publishing House · Admin" : "Shop · Admin",
    lede: wordsFor(sells)("Sign in with the shop's Google account to manage books, orders and settings."),
  };
}
