import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-photo-viewer",
  date: "2026-10-13",
  title: "Design studio: style the enlarged photo viewer on book pages",
  summary: "The round “enlarge” button on a book's main photo and the full-screen viewer it opens now have their own Studio controls: button background, icon colour, outline colour and shape (round, softly rounded or square), the background behind the enlarged photo, and whether the “2 of 5” photo count shows and in what colour. Find them in Settings › Design › Theme settings › Parts of your shop › Shop & book pages › Product page · buy card & details › Enlarged photo viewer. The viewer can also be clicked in the preview to open these controls. Nothing changes until you set something: it keeps today's look. Its words stay in Text & labels › Product page.",
  links: [{ label: "Open the photo viewer controls", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
