import type { AppUpdate } from "../appUpdates";

export default {
  id: "held-orders-duty-estimates",
  date: "2026-11-02",
  title: "Held orders on every page, Square checks, and duty estimates",
  summary: "When a payment looks risky and an order is held back, a yellow alert now says how many orders are waiting for you, on every admin page, and opens the orders so you can clear them. Shops taking cards through Square get the same hold when Square rates a payment high risk or rejects the card's security or postal code. In Settings › Taxes › Duties you can also give a particular country its own estimate, such as Germany 19, instead of one number for everywhere.",
  links: [{ label: "Open orders", tab: "orders" }, { label: "Open tax settings", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
