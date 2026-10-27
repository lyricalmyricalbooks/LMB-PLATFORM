import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-3-themes", date: "2026-10-09", title: "A Themes tab, and private preview links you can share",
  summary: "The Design studio has a new Themes tab. It shows your live theme, your draft, your saved themes and the ready-made looks as cards with small pictures of their colours and fonts. Preview shows any of them in the preview without changing your draft; Customize loads one to edit; Publish… loads it and asks before it goes live. You can also share a preview: Share a preview link makes a private link that shows your shop with that design for 1, 7 or 30 days, so someone can look before you publish. People who open it see a banner saying it isn't live yet, search engines skip it, and their visits aren't counted. You can turn a link off at any time. Share links need the updated Firestore security rules to be deployed; until then the studio explains this. Tested with local checks only.",
  links: [{ label: "Open Themes", tab: "settings", settingsTab: "designer", studio: "#designer?tab=themes" }],
} satisfies AppUpdate;
