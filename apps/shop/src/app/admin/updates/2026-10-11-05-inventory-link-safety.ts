import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-link-safety", date: "2026-10-11", title: "Inventory app link: safer stock updates and an off switch",
  summary: "Fixes found in a second check of the new inventory app link, before anyone has switched it on. Website stock is only updated once every recent website sale is recorded, so a sale from a moment ago can't be put back on sale. Matching more books now re-sends every affected past order, however many there are. A label bought in the inventory app is refused while the website is buying one for the same order, so you never pay for two, and Order detail has Remove the inventory app label when you'd rather buy it on the website. Applying stock no longer switches on stock counting for a book whose e-book or unmatched editions it would block. Unmatch all books works even when the inventory app can't be reached, so their stock can always be edited on the website again. Stock follows the inventory app only after you apply a first preview and switch on automatic updates; big changes still wait for you.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
