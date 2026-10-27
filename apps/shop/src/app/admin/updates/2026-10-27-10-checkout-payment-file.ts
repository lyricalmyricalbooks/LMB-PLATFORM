import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-payment-file",
  date: "2026-10-27",
  title: "The checkout payment step has its own file",
  summary: "Behind the scenes, the server code that prices an order and opens the card payment, pay-at-pickup orders and free orders now lives in its own file, separate from everything else checkout does. Checkout works exactly as before; changes to it can now be reviewed on their own.",
  links: [{ label: "Open payment settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
