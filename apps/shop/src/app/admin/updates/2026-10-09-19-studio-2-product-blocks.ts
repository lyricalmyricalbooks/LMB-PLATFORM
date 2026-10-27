import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-product-blocks", date: "2026-10-09", title: "Arrange the buy box on book pages",
  summary: "The box on each book page with the title, price and Add to bag button can now be rearranged in the Design studio. Open a book page, and Page layout shows Buy box blocks: move pieces up or down (for example put the price above the title), hide the ones you don't want, and add your own — a short text, a collapsible note such as Shipping & returns, a badge such as Staff pick, a Look inside link, or one of your book details (like Series). Your own blocks can show each book's details automatically and hide themselves when a book doesn't have that detail. The title and the Add to bag button always stay. Each book page template can have its own arrangement, and until you change it, a template follows the default one. The book page looks exactly as before until you make a change. Also fixed: hiding a part of the buy box (such as the sale end date) on an alternate book page template now takes effect. Tested with local checks only.",
  links: [{ label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?t=productPage&tab=sections" }],
} satisfies AppUpdate;
