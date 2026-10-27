import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-cookie-buttons",
  date: "2026-10-13",
  title: "Studio: style the cookie banner's buttons and choices",
  summary: "The cookie banner's button row (Accept all, Reject, Customize / Save choices) and its list of choices (Necessary, Analytics, Marketing) can now be clicked in the Studio preview and styled per screen size: spacing, gap, width, borders, colours and text. They can't be hidden, because shoppers must always be able to answer. Find them in Studio › Theme settings › Advanced › Fine-tune single elements › Loading, cookies & construction · layout; their words stay in Text & labels › Cookie banner. Nothing changes on the live shop until you edit them.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
