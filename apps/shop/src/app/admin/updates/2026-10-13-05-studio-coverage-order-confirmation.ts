import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-order-confirmation",
  date: "2026-10-13",
  title: "Studio: style each part of the order confirmation page",
  summary:
    "The “Thank you” page shoppers see after paying can now be fine-tuned piece by piece in Studio. The thank-you card (order number and payment status), the payment instructions box shown for e-Transfer or cash orders, and the Continue shopping button can each be clicked in the preview and given their own spacing, size, colours and fonts on desktop, tablet or phone. Continue shopping can also be hidden; the thank-you card and payment instructions can't, because shoppers need them. Find them in Studio › Theme settings › Advanced › Fine-tune single elements › Checkout · layout & elements. Their words stay in Text & labels › Checkout. Nothing changes on the live shop until you change a setting.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
