import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-checkout-packed-note",
  date: "2026-10-13",
  title: "Studio: hide or restyle the “Carefully packed and tracked” note at checkout",
  summary: "The small reassurance box under the checkout total can now be clicked in the Studio preview, hidden on desktop, tablet or phone, and restyled (spacing, border, colours, text). Find it in Studio › Theme settings › Advanced › Fine-tune single elements › Checkout · layout & elements › “Packed & tracked note (under the total)”. Its words stay in Text & labels › Checkout (Reassurance title / Reassurance text). Nothing changes on the live shop until you edit it.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
