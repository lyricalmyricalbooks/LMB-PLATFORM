import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-b4-finish",
  date: "2026-10-18",
  title: "The Overview board gets its new header, Needs you list and chart",
  summary: "The Overview now opens with its own header: the period buttons (Today, 7d, 30d, 90d, MTD, Last month, YTD, 12m, Custom), a vs choice (period before or same days last year), a Layout picker and Edit board. It refreshes itself every 5 minutes while the tab is open, and the line under the header has Refresh, Export CSV and Save these figures as a view, so a layout can open on its own period. Needs you is a short list of what is waiting, each with a coloured tag, and drops what is done. Newest orders and Ready to sell? are redrawn to match. The revenue chart shows the period's total and change, visitors behind it as grey bars, and the period before as a dashed line. Widgets have a cleaner title bar with Full view, sizes appear when you point at a widget, and while editing you can drag a widget's corner to resize it and add widgets from a list docked beside the board.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
