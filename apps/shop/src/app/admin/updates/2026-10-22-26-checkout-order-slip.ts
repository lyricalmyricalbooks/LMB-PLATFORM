import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-order-slip",
  date: "2026-10-22",
  title: "Checkout redesigned as an “order slip”",
  summary:
    "Checkout now matches the rest of the shop. It is one page in four lettered parts (Contact, Ship to, Delivery, Pay) with labels above every box, delivery choices as a list with their prices, and a big Pay button that shows the total. Beside it sits an outlined “Order slip” listing each numbered book with its cover, the discount and gift card boxes, the totals and a footer strip. On phones the slip folds into a bar at the top and Pay stays pinned to the bottom of the screen. Every part can be changed in Design › Theme settings › Checkout page (header, section letters, fields, Pay button, order slip, phone Pay bar), and every word is in Text & labels › Checkout. Prices, payments, stock holds and the order itself work exactly as before.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
