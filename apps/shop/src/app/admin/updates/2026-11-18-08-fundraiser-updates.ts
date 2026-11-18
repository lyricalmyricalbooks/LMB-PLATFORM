import type { AppUpdate } from "../appUpdates";

export default {
  id: "fundraiser-updates",
  date: "2026-11-18",
  title: "Send updates to your fundraiser's supporters (Beta)",
  summary: "Keep the people who gave in the loop: Write an update on a fundraiser sends your news by email to everyone who gave to it, once each, even if they gave twice. Send yourself a test first, see how many it reached, and stop it while it's going out. People who unsubscribed are skipped, and every email has a link to stop them. Works for past fundraisers too, for news about rewards.",
  links: [{ label: "Donations", tab: "giving" }],
} satisfies AppUpdate;
