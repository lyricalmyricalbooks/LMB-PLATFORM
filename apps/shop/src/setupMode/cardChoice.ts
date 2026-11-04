// Stripe or Square (setup's Settings › Payments): the words a press reads when it picks who takes its website's card
// payments, and the choice as the review shows it. Pure, so every line is tested without a browser. A press that picks
// nothing starts on Stripe (the platform's sign-up default), so the review says so.
import type { SetupPress } from "./door";

export type CardProviderId = "stripe" | "square";

export const CARD_PROVIDER_CHOICES: ReadonlyArray<{ id: CardProviderId; name: string; line: string }> = Object.freeze([
  {
    id: "stripe",
    name: "Stripe",
    line: "Shoppers pay without leaving your website, with Apple Pay and Google Pay too. A good choice if you don't use Square already.",
  },
  {
    id: "square",
    name: "Square",
    line: "Use the Square account you already have for fairs and markets, so all your card sales land in one place. Shoppers pay on Square's secure page and come straight back.",
  },
]);

export const CARD_CHOICE_INTRO = "Pick the company that takes your website's card payments and sends the money to your bank.";

export const CARD_CHOICE_NOTES: ReadonlyArray<string> = Object.freeze([
  "Refunds, part refunds, payment links, extra payments on an order, gift cards and your payout reports work the same with either one.",
  "You connect your account after your shop is made, in Settings › Payments. It takes a few minutes on their own secure page.",
  "Each company charges its own card fee. Colophon charges you the same either way.",
  "You can change your pick any time before your shop is made.",
]);

/** The provider the shop will start with: the press's pick, else Stripe. */
export const chosenCardProvider = (press: Pick<SetupPress, "cardProvider">): CardProviderId => (press.cardProvider === "square" ? "square" : "stripe");

/** The provider's name, for the review. */
export const cardProviderName = (id: CardProviderId): string => (id === "square" ? "Square" : "Stripe");
