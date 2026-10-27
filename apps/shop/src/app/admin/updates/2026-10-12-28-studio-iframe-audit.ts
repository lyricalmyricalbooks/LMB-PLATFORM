import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-iframe-audit",
  date: "2026-10-12",
  title: "Design studio: the default header follows your menu and link settings, and controls show their real starting values",
  summary: "We tested Studio's buttons and settings against the live preview and fixed what didn't reach it. The default (Reference) shop header now shows your Navigation › Header menu links, and uses Navigation links colour, size, letter case, sticker pills, Logo alignment, Space between links, and the Logo colour and text logo. Theme settings › Catalog layout (advanced) › Max categories in the nav now explains that this header shows only that many categories, and Navigation › Shop categories marks the ones left out. About 20 controls showed Off or the wrong number while the shop drew something else (Sale badge, Share button, Layout, Line above card title, nav link size and more); they now start where the shop is. The product page Sale badge follows its switch, Heading weight reaches the book title, and the bag's own background wins over the checkout background. The checkout preview shows a sample book (only in Studio, never added to a bag), so checkout styles and Cart sections can be seen while you edit them. Also fixed: Escape now cancels a spacing drag, linked blocks keep their name in the outline, the sticky add-to-bag bar says it only shows on book pages, and the footer About text shows the words shoppers see. Your current header menu links will start to show in the live header once this version is live.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
