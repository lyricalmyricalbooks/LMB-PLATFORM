import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-one-inspector", date: "2026-10-09", title: "Click any part of your shop to edit it in one place",
  summary: "In the Design studio, clicking any part of the preview — the header, the category bar, the buy card, the shopping bag, the footer — now opens its settings on the right, in tabs: Words (the words shown in that part), Style, Layout and Visibility. You no longer get a small \"what do you want to edit?\" menu or get sent to another tab. Sections have the same tabs (Content, Style, Layout, Visibility), with a new switch to hide a section on tablets only. The separate Shared layout tab is gone: the header and footer are listed in Page layout. Deleting from the preview's toolbar now happens straight away with an Undo button.",
  links: [{ label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?tab=sections" }],
} satisfies AppUpdate;
