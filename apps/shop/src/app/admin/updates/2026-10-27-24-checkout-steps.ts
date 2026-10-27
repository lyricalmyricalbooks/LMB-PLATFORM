import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-steps",
  date: "2026-10-27",
  title: "Checkout's three steps have their own files",
  summary: "Behind the scenes, the address, delivery and payment parts of checkout now each live in a file of their own, so each step is smaller and easier to change safely. Paying works exactly as before: the charge and every payment check stay where they were, and checkout looks the same in Studio and for shoppers.",
  links: [{ label: "Open payment settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
