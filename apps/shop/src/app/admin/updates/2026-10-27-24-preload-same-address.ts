import type { AppUpdate } from "../appUpdates";

export default {
  id: "preload-same-address",
  date: "2026-10-27",
  title: "The bag works on the old shop address too",
  summary: "Pages saved for search engines named the shop's main domain for their code files, so a visitor arriving on the old lmb-test-shop.web.app address had the bag drawer blocked by the browser. Those files now load from whichever address the visitor is on. Takes effect after the next storefront deploy. Nothing is needed from you.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
