import type { AppUpdate } from "../appUpdates";

export default {
  id: "payments-first",
  date: "2026-11-02",
  title: "Get paid, in the setup guide",
  summary: "The setup guide has a Get paid step after Google. It shows whether your card account is connected, what Stripe or Square still needs and by when, and one button to finish it. Stripe's or Square's own secure page asks for the details, and you come straight back here. You can set it up later, but the final check keeps the card step open until cards and payouts work.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
