import type { AppUpdate } from "../appUpdates";

export default {
  id: "publish-sample-warning",
  date: "2026-11-24",
  title: "Publish reminds you of sample sections",
  summary: "When you press Publish in Studio, the confirmation now says how many sections still show a starter website's sample words and pictures, so your shop never goes live with them by accident. Those sections are marked Sample in Page layout until you change them.",
  links: [{ label: "Design", tab: "design" }],
} satisfies AppUpdate;
