import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-page-structure", date: "2026-10-08", title: "See every part of a page in one list",
  summary: "Page layout in the Design studio now lists the whole page you're previewing, top to bottom: the header and its parts, the parts built into the page (like the catalog heading and product grid) and your sections, the footer, and pop-overs. Point at a row and the preview outlines that part; point at the preview and the row lights up. Click a row to open its settings. Built-in parts have an eye button to hide them on the size you're previewing (parts shoppers need, like the newsletter button, show a lock instead). Pop-overs has \"Open in preview\" for the shopping bag and search, so you can style them without adding a book first. You can also rename a section (Section actions › Rename) — the name is only shown in the studio. When you click a part with several kinds of settings, the choices are now clearly named (for example \"Style: Header & announcement bar\" or \"Words: Header\"). Also fixed: on a slow connection, a section you selected before the preview finished loading no longer gets unselected when it does.",
  links: [{ label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?tab=sections" }],
} satisfies AppUpdate;
