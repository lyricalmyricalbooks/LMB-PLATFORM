import type { AppUpdate } from "../appUpdates";

export default {
  id: "domain-ready-lyricalmyricalbooks-com",
  date: "2026-10-12",
  title: "Ready for your own address: lyricalmyricalbooks.com",
  summary: "The shop is prepared to move to lyricalmyricalbooks.com. Nothing changes yet: the shop stays on its current address until you connect the domain in Firebase Hosting and set the SITE_URL setting in GitHub (docs/CUSTOM_DOMAIN.md has every step, in order). When you do, visitors on www.lyricalmyricalbooks.com and the old web.app address are sent to the same page on lyricalmyricalbooks.com, and the shop's built-in sharing links name the new address too. The address may be typed with a capital letter. After the switch, the deploy's live check confirms the old addresses still forward. The Custom domain box in Settings › General now explains that it's a label only.",
  links: [{ label: "Open Settings › General", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
