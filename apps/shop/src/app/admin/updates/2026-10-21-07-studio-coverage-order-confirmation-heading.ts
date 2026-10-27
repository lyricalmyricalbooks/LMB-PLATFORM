import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-order-confirmation-heading",
  date: "2026-10-21",
  title: "Studio: style the big “Thank you” and the delivery details on the order confirmation",
  summary: "After paying, every shopper sees a large “Thank you” heading and, under the order summary, a block with the delivery method, the ship-to address and a tracking note. Both are now their own parts in the designer: click them in the preview, or find them in Theme settings › Checkout · layout & elements, to change their size, font, colour, spacing or hide them on desktop, tablet or phone. Their words stay in Text & labels › Checkout. Nothing changes on the shop until you set something. Checked with the automated tests and a local build; it takes effect once the storefront is deployed.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
