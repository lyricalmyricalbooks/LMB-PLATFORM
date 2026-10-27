import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-grid-arrange",
  date: "2026-10-15",
  title: "Studio: drag blocks on a grid in the Flexible composition section",
  summary: "Select a Flexible composition section in Studio and choose Arrange on page. A grid appears over it in the preview: drag a block to move it, or drag its corner to resize it, and it snaps to the grid columns. Arrow keys move the selected block one cell, and Shift + arrow keys resize it. Each screen size (desktop, tablet, phone) keeps its own arrangement. A Layers list puts one block in front of another, and each block can be rotated, made bigger or smaller, or made see-through. Every change can be undone.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
