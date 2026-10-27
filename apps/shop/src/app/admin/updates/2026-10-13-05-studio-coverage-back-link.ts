import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-back-link",
  date: "2026-10-13",
  title: "Studio: book page Back link and breadcrumb mark",
  summary: "On a book page, the “Back” link above the breadcrumb can now be clicked in the Studio preview to edit it, and its arrow can be switched off (Theme settings › Product page · buy card & details › Breadcrumb & small labels). The “/” between breadcrumb links is now editable in Text & labels › Product page › Breadcrumb: mark between links. The shop looks the same until you change them.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
