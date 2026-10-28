import type { AppUpdate } from "../appUpdates";

export default {
  id: "plain-words",
  date: "2026-10-28",
  title: "Nothing technical on a shop Colophon runs",
  summary: "If Colophon runs your shop, the admin no longer asks for accounts or passwords of your own, and no technical words show. The PayPal, carrier label, Google and writing-assistant panels, the address finder's setup and the email provider's setup are hidden there. Alerts, launch checks, order lines and error messages use plain words (a payment \"waiting for confirmation\"), and search engine set-up needs no step from you. A test now reads every message a Colophon shop can show and fails on technical words. Shops on their own accounts keep their panels.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }, { label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
