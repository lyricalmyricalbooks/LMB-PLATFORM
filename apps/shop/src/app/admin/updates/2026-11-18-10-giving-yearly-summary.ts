import type { AppUpdate } from "../appUpdates";

export default {
  id: "giving-yearly-summary",
  date: "2026-11-18",
  title: "A yearly summary of tax receipts for your givers (Beta)",
  summary: "If your shop gives tax receipts, each giver now gets one email in January listing every receipt you issued them for the year before, with the total, so they have it in one place at tax time. Cancelled and test receipts are left out, and people who unsubscribed from your emails don't get it. Untick \"Email each giver a summary of the year's gifts in January\" in Donations › Amounts & choices › Tax receipts if you'd rather not send it.",
  links: [{ label: "Donations", tab: "giving" }],
} satisfies AppUpdate;
