import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-groups-shipping-limits",
  date: "2026-11-18",
  title: "Tax and shipping follow what a product is",
  summary: "A product's type now decides its tax group and how it can travel. Settings › Taxes can add a rate just for children's clothing and shoes, groceries, books or digital items, and each product follows its type's group. Fresh food and plants are offered pickup or local delivery only, and perfume, drinks and other liquids skip air services. Starting rates come with a reminder to check them before you save.",
  links: [{ label: "Open Taxes", tab: "settings", settingsTab: "taxes" }, { label: "Products", tab: "catalog" }],
} satisfies AppUpdate;
