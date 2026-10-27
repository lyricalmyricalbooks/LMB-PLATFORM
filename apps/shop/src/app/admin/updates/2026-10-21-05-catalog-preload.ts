import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-preload",
  date: "2026-10-21",
  title: "The shop's book list starts downloading sooner",
  summary: "The page now asks for the shop's book list at the same moment it asks for the app itself, instead of waiting until the app has started. Visitors should see books a little sooner on a cold visit. It is not used on the admin or in Studio previews. This is a local build change; it takes effect once the storefront is deployed.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
