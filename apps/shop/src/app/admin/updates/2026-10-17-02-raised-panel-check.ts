import type { AppUpdate } from "../appUpdates";

export default {
  id: "raised-panel-check",
  date: "2026-10-17",
  title: "Studio control check tests Raised panel background on the checkout",
  summary: "Maintenance: on the home page, Colours › Raised panel background only colours the grey placeholders shown while book photos load, so the automatic check passed or failed depending on whether the photos had arrived. It now tests the control on the checkout, where the order summary panel uses that colour all the time. Book page › Add-to-bag animation is recorded as not checkable: the check runs with reduced motion, where the shop never plays it, so its result depended on timing. Nothing in Studio or the shop changes.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
