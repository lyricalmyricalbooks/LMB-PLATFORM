import type { AppUpdate } from "../appUpdates";

export default {
  id: "metric-shipping-weights",
  date: "2026-10-18",
  title: "Shipping weights are now in grams and kilograms",
  summary: "Book and edition weights are entered in g or kg only, and the book page shows them in metric. Any weight saved earlier in lb or oz opens in grams and is saved that way, and shipping prices treat it exactly as before. The label dialog in an order asks for the parcel weight in grams, and live carrier quotes, labels and customs forms are sent to Shippo in grams. This takes effect with the next storefront and Functions deploy.",
  links: [
    { label: "Open Books", tab: "catalog" },
    { label: "Open Orders", tab: "orders" },
    { label: "Shipping settings", tab: "settings", settingsTab: "shipping" },
  ],
} satisfies AppUpdate;
