// Stripe or Square (setup's Settings › Payments): the words a press reads when it picks who takes its website's card
// payments, and the choice as the review shows it. Pure, so every line is tested without a browser. A press that picks
// nothing starts on Stripe (the platform's sign-up default), so the review says so.
import type { SetupPress } from "./door";

export type CardProviderId = "stripe" | "square";

export const CARD_PROVIDER_CHOICES: ReadonlyArray<{ id: CardProviderId; name: string; line: string }> = Object.freeze([
  { id: "stripe", name: "Stripe", line: "Shoppers pay on your website. Apple Pay and Google Pay included." },
  { id: "square", name: "Square", line: "Use the Square account you already have." },
]);

/** The one line under the choice. */
export const CARD_CHOICE_NOTE = "You connect it after your shop is made.";

/** Countries where Square works with the shop's checkout (the platform's signup/form.js SQUARE_COUNTRIES; tested). */
export const SQUARE_COUNTRIES: ReadonlyArray<string> = Object.freeze(["CA", "US", "IE", "FR"]);
export const squareAvailable = (country: string): boolean => !country || SQUARE_COUNTRIES.includes(country);

/** The provider the shop will start with: the press's pick, else Stripe. */
export const chosenCardProvider = (press: Pick<SetupPress, "cardProvider">): CardProviderId => (press.cardProvider === "square" ? "square" : "stripe");

/** The provider's name, for the review. */
export const cardProviderName = (id: CardProviderId): string => (id === "square" ? "Square" : "Stripe");
