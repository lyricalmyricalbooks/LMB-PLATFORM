import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-4-performance", date: "2026-10-09", title: "A faster Design studio, quicker long pages and speed tips",
  summary: "Editing in the Design studio does much less work on every change: in our tests one edit went from about 0.9 ms to 0.2 ms on your current design, and from about 15 ms to under 1 ms on a design six times larger, so typing stays smooth as your shop grows. On the shop, sections further down a page are now drawn only when shoppers scroll near them, so long pages show sooner; everything is still on the page for search engines and screen readers. You can switch this off in Theme settings › Layout & spacing. Studio Health also gives speed tips: pictures that may make the page jump while loading, a main picture at the top that loads late, and pages whose pictures add up to a lot to download. Tested with local checks only.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
