import type { AppUpdate } from "../appUpdates";

export default {
  id: "bring-gift-cards-over",
  date: "2026-11-03",
  title: "Bring gift cards over from your old shop",
  summary: "Gift cards now has a “Bring gift cards over” button. Choose the gift card file from your old shop and every card with money left comes over with its balance, so the people holding them can still spend them. Where the file shows a card's full code it is kept; where it hides it, the card gets a new code and you can email each holder theirs. Bringing the same file twice adds nothing.",
  links: [{ label: "Open Gift cards", tab: "giftCards" }],
} satisfies AppUpdate;
