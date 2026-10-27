import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-motion",
  date: "2026-10-15",
  title: "Studio: motion for sections — blocks that appear as you scroll, hover lifts, sticky and parallax",
  summary: "Each section now has a Motion group on its Style tab. The blocks or cards inside can fade, zoom or slide in one after another as shoppers scroll to them, with your choice of delay and speed. Blocks and cards can lift or grow slightly when pointed at. A section can stay on screen while scrolling (sticky), and its background picture can drift as the page scrolls (parallax), in browsers that support it. Play this section's motion replays it in the preview. Motion can be turned off on phones, and shoppers whose device asks for less motion never see it. Content never stays hidden if the page's script doesn't load.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
