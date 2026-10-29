import type { AppUpdate } from "../appUpdates";

export default {
  id: "registered-question",
  date: "2026-10-29",
  title: "Taxes now start by asking if you're registered for GST/HST",
  summary: "Settings › Taxes opens with one question. Choose No and customers pay no tax (your rates stay saved for when you register); choose Yes and tax is collected with the rates below. The preset that adds a provincial sales tax now asks whether you are registered in those provinces before it fills anything in. Nothing changes until you press Save.",
  links: [{ label: "Open Taxes", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
