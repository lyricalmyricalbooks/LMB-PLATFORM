import type { AppUpdate } from "../appUpdates";

export default {
  id: "check-big-orders",
  date: "2026-11-02",
  title: "Hold big card orders until you've looked at them",
  summary: "In Settings › Payments › Check big orders you can type an amount, such as 500. A card order of that size or larger now waits in Needs attention, with the reason shown, until you press It looks fine. It works alongside the card company's own risk checks, and it is off until you set an amount.",
  links: [{ label: "Open payment settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
