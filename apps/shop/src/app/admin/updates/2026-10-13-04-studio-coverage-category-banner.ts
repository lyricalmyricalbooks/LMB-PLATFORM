import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-category-banner",
  date: "2026-10-13",
  title: "Studio: style the category banner and the shop's empty and error messages",
  summary:
    "When a shop category has a picture or description, the banner at the top of its page can now be clicked in the Studio preview and styled piece by piece: the whole banner, its picture (crop and focus), the category name and the description. Each piece can be resized, recoloured or hidden on desktop, tablet or phone. The “No publications match these filters” message and the “catalog could not be loaded” notice can be clicked and styled too (the notice can't be hidden, because shoppers need its Try again button). Find them in Studio › Theme settings › Advanced › Fine-tune single elements › Catalog & shared content · layout. The banner's words and picture are still edited in Navigation › Shop categories. Nothing changes on the live shop until you change a setting.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
