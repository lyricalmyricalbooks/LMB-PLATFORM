import type { AppUpdate } from "../appUpdates";

export default {
  id: "bring-your-domain",
  date: "2026-11-14",
  title: "Bringing your own domain is clearer and checks itself",
  summary: "Settings, General, Web address now walks you through connecting a domain you already own. Your domain stays with the company you bought it from. If it still shows an old website, the page lists the old lines to take out first, then the new ones to add, each with a Copy button. A small tracker shows Connect, Secure and Live, and the page looks again by itself every half minute, so you can leave it open and watch it turn Live. Removing an address now takes its www partner with it, and you can sign in to your admin at the new address as soon as it works.",
  links: [{ label: "Open Web address", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
