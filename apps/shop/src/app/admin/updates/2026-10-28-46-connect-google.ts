import type { AppUpdate } from "../appUpdates";

export default {
  id: "connect-google",
  date: "2026-10-28",
  title: "Connect Google with one sign-in",
  summary: "On a shop run by Colophon, a Connect Google button on the Overview and in Settings › General › Visitors & Google replaces the Google Analytics setup steps. Sign in with your Google account and allow Colophon once. Your shop then counts visits in your own Google Analytics (only for visitors who agree to it), joins Google search with its book list, and sends your books to Google Shopping's free listings. Extras like nightly backups to your Google Drive are one tick box each. Each part shows how it went, with Try again, and Disconnect Google stops it all while your Google accounts stay yours. The Gmail password panel is gone from Email sender on these shops: your emails go out with your press's name, and from orders@ your own address once it opens your shop. This arrives once Colophon switches it on.",
  links: [
    { label: "Open Visitors & Google", tab: "settings", settingsTab: "general" },
    { label: "Open the Overview", tab: "overview" },
  ],
} satisfies AppUpdate;
