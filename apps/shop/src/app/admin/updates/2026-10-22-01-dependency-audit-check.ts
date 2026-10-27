import type { AppUpdate } from "../appUpdates";

export default {
  id: "dependency-audit-check",
  date: "2026-10-22",
  title: "Every change is now checked for known package security problems",
  summary: "Before a change can be merged, an automatic check looks at every package the shop and its server functions use and stops the change if one has a known high or critical security advisory. This is a safety net for the code behind the shop; nothing you see in the admin or on the storefront changes. The one open low-severity advisory (the page editor's HTML export) is already guarded and does not block changes.",
  links: [{ label: "Open Settings", tab: "settings" }],
} satisfies AppUpdate;
