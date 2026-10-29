import type { AppUpdate } from "../appUpdates";

export default {
  id: "go-live-checks",
  date: "2026-10-28",
  title: "A go-live checklist that knows Colophon, and Canadian tax presets",
  summary: "On a shop run by Colophon, the Ready to sell list on Overview now checks whether your Square or Stripe account is connected and can take cards. It no longer asks you to check technical settings, which Colophon looks after. Settings › Taxes has a new Start from a preset card: pick Canadian printed books or other goods, and it fills in every province you haven't set yet. Rates you already set are never changed. Review the rates, then save.",
  links: [
    { label: "Open Overview", tab: "overview" },
    { label: "Open Taxes", tab: "settings", settingsTab: "taxes" },
  ],
} satisfies AppUpdate;
