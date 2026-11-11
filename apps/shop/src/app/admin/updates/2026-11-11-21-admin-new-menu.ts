import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-new-menu",
  date: "2026-11-11",
  title: "A simpler menu",
  summary: "The side menu now shows only the main items. The pages inside an item sit as a row of buttons at the top of the page, and Settings lists its pages under headings: Shop, Selling, Messages, Connections and Safety. Customers has its own item, Sales channels moved to Marketing, and the Fair till is now just the Till. The stockroom's To-do and Open call left the menu but still open from their links.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
