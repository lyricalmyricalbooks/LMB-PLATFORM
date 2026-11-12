// The sign-in screen's words (12 November 2026). Nobody is signed in yet, so what the shop sells comes from the public
// settings (`settings/website.sells`): a shop that doesn't sell books isn't called a publishing house.
import { sellsBooks, wordsFor } from "../../shared/shopSells";

export function loginWords(sells?: string | null): { sub: string; lede: string } {
  return {
    sub: sellsBooks(sells) ? "Publishing House · Admin" : "Shop · Admin",
    lede: wordsFor(sells)("Sign in with the shop's Google account to manage books, orders and settings."),
  };
}
