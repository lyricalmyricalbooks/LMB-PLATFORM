import type { AppUpdate } from "../appUpdates";

export default {
  id: "pay-as-you-sell-cancel",
  date: "2026-11-03",
  title: "Paying as you sell: your plan no longer looks cancelled, and you can cancel it",
  summary: "If you switch to paying a share of each sale, Settings, Plan now says Paying as you sell instead of Ending, and there is no Keep my plan button that would have started a monthly bill on top of the fees. You can now cancel while paying as you sell: fees stop at the end of your billing month, the shop stays open until then, and you can change your mind until that day. Only the person whose account pays for the plan can change its card or billing details.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
