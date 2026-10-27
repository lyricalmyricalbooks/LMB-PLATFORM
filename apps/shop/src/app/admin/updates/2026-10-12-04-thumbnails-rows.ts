import type { AppUpdate } from "../appUpdates";

export default {
  id: "thumbnails-rows",
  date: "2026-10-12",
  title: "Book photo thumbnails can sit on several rows",
  summary:
    "The small photo thumbnails on a book page used to sit in one line that shoppers scroll sideways. You can now let them wrap onto as many rows as they need, so every photo is visible at once. Turn it on in Studio › Theme settings › Product page · buy card & details › Photo frame & thumbnails › Thumbnails on several rows. It works when thumbnails are set to “Under the photo”, and on phones (where thumbnails always sit under the photo). It is off by default, so nothing changes until you switch it on.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
