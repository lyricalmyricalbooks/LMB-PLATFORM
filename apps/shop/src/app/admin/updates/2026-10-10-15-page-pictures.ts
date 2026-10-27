import type { AppUpdate } from "../appUpdates";

export default {
  id: "page-pictures", date: "2026-10-10", title: "Pictures, videos and more formatting on your pages",
  summary: "Pages (About, Open call, History…) can now hold pictures. In Design studio › Pages, open a page and use Add pictures, Choose from library, or simply paste or drag a picture into the text. Pictures are uploaded and resized for you (they also appear in Media), and each one goes on its own line. Click a picture to set its size (Small, Medium, Large, Full width or Original), line it up left, centre or right, give it a description for screen readers and search engines, or remove it. The text toolbar also gained strikethrough, indents, text alignment, a divider line and video embeds (YouTube or Vimeo links), and stays in view while you write a long page. Under the editor you'll see the word count, reading time, and a warning when a picture has no description. Each page can also have its own Sharing image for social media and search results; without one, the page's first picture is used. Pages still save straight away with Save page. The new formatting shows on the live site once this release is deployed.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
