import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-link-shared-editions", date: "2026-10-11", title: "Inventory app link: signed and unsigned share one count",
  summary: "Two editions of the same book that are really the same copies — like The Hound's Signed and Unsigned hardcovers — can now both be matched to the one book in the inventory app. They show the same count, and a sale or refund of either changes both, so the last copy can't be sold twice. Checkout also holds them as one pile. Match both editions in Inventory › Inventory app link, save, then Preview stock changes and Apply. Two different books still can't share one inventory book.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
