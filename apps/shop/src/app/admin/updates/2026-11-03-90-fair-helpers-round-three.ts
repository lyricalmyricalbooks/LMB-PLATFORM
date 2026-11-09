import type { AppUpdate } from "../appUpdates";

export default {
  id: "fair-helpers-round-three",
  date: "2026-11-03",
  title: "Fair helpers: card payments by QR, covers, cash count and one-day access",
  summary: "A Fair helper can now take a card payment: they tap QR / Stripe, the customer scans the code with their phone and pays, and the sale is recorded by itself once the payment goes through. Prices always come from your stockroom, never from the helper's phone. Books that are only in your stockroom can have a cover photo (in the book's form), so helpers see a cover for every book. At the end of the day the helper's till shows the cash they should hand you. And when you add a helper you can tick Just for today, so their access ends by itself tonight.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
