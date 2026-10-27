import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-terms-checkbox",
  date: "2026-10-22",
  title: "Optional “I agree to the terms” tick in the shopping bag",
  summary:
    "Like the terms checkbox many Shopify shops add to their cart, the shopping bag can now ask shoppers to tick “I agree to the Terms of service” before its checkout button takes them on. The words link to your terms page when you have written terms in Settings › General › Policies, a reminder appears if they press the button without ticking, and the tick is remembered while they browse. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Total & checkout button › Terms checkbox, so the live shop is unchanged. The words are in Text & labels › Cart › Terms checkbox.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
