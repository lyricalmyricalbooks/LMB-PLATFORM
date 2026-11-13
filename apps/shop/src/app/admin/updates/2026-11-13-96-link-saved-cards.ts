import type { AppUpdate } from "../appUpdates";

export default {
  id: "link-saved-cards",
  date: "2026-11-13",
  title: "Returning shoppers pay with a saved card in one tap",
  summary: "Checkout now passes the shopper's email and name to the card form, so anyone who saved a card with Link is recognised and pays without typing it again. The Apple Pay and Google Pay switches in Payments now show the right state: they were on at checkout even when the switch looked off.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
