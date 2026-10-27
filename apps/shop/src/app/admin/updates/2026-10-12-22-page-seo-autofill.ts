import type { AppUpdate } from "../appUpdates";

export default {
  id: "page-seo-autofill",
  date: "2026-10-12",
  title: "Fill in a page's search listing in one click",
  summary:
    "In the Design studio's Pages tab, the Search listing (SEO) box now has an Auto-fill from page button. It writes the search title from the page title and the description from the page's opening sentences (up to 160 characters, ending on a whole sentence or word), filling only blank boxes; if both are already filled it asks before replacing them. Nothing is saved until you press Save page. The page list also offers Fill in missing search listings, which fills every page's blank search title or description at once and saves them, leaving anything you wrote yourself untouched.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
