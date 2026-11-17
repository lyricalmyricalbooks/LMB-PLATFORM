import type { AppUpdate } from "../appUpdates";

export default {
  id: "search-engines-see-your-shop",
  date: "2026-11-17",
  title: "Search engines see your shop, not a template",
  summary: "A product you add shows up in Google with your shop's name and address straight away, instead of a placeholder shop's details until the next update. A product or page you removed now tells search engines it is gone, so they stop listing it, and an old address you sent on in URL redirects moves for good. If you use your own web address, your free Colophon address now sends visitors and search engines to it, so Google lists one address for your shop. Pages also reach visitors and search engines about five times smaller, so they open faster.",
  links: [{ label: "Products", tab: "catalog" }, { label: "Your web address", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
