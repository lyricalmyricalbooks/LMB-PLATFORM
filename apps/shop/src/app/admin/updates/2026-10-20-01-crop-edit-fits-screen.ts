import type { AppUpdate } from "../appUpdates";

export default {
  id: "crop-edit-fits-screen",
  date: "2026-10-20",
  title: "Crop & edit fits on the screen again",
  summary: "The Crop & edit window in the book editor ran past the bottom of the screen, so the lower settings, the previews and the Apply button were out of reach. It now stays inside the window and its settings scroll, on computers and phones. Other windows opened from the book editor get the same fix.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
