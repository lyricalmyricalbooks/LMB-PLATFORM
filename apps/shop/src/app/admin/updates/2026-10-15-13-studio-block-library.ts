import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-block-library",
  date: "2026-10-15",
  title: "Studio: a block picker you can try on the page, copy and paste blocks, page starters and header/footer colour schemes",
  summary: "Adding a block now opens a picker beside the preview: point at a choice (text, picture, button, group, a copy of a block already there, a shared block or one you copied) to see it on the page, then click to add it. Blocks can be copied from one section and pasted into another section of the same kind. Studio › Pages › New page offers starters (About, Shipping & returns, FAQ, Contact, Submissions, Journal) with headings and [prompts] to replace; they open as drafts so shoppers never see the prompts. The header and footer can follow a colour scheme in Theme settings › Colour schemes, and the bag's “Continue shopping” address now uses the link picker.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
