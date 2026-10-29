import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-address-region",
  date: "2026-10-27",
  title: "Your shop's address, server location and owner come from your own settings",
  summary: "Links in emails, the shop's pages and the help links in Settings now use your shop's own address, and your shop's server can run in the region your shop is set up in. The page no longer has the owner's email built in: the admin learns it after you sign in, and only the owner and staff are told it.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
