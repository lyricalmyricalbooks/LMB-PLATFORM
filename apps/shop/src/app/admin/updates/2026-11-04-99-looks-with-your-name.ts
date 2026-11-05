import type { AppUpdate } from "../appUpdates";

export default {
  id: "looks-with-your-name",
  date: "2026-11-04",
  title: "Looks show your name, open on a phone",
  summary: "Each look under Design › Themes is drawn with your shop's name and logo. Click a look's picture to see it full size on a phone in the preview. Look previews write prices the way your shop does, in Canadian dollars.",
  links: [{ label: "Open Themes", tab: "settings", settingsTab: "designer", studio: "designer?tab=themes" }],
} satisfies AppUpdate;
