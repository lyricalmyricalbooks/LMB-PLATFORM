import type { AppUpdate } from "../appUpdates";

export default {
  id: "sale-percent-badge",
  date: "2026-10-13",
  title: "Sale badges can show how much is saved",
  summary: "Like Shopify's “Save 20%” labels, the sale badge on shop cards and the product page can now read “Sale −20%”. It is off by default: turn it on in Studio › Theme settings › Site-wide design › Badges & shop labels (“Show the saving on the sale badge”). Change the wording in Text & labels › Product page (“Sale badge with the saving”). Books sold in editions keep the plain badge.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
