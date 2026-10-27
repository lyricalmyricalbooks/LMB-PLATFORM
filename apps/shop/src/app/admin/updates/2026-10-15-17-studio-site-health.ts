import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-site-health",
  date: "2026-10-15",
  title: "Studio Health can now check every page of your shop at once",
  summary: "In Studio, open the Workbench's Health tab and choose Check every page. Studio quietly opens Home, the shop, a book page for each book-page layout, your custom and policy pages, your categories and the wishlist, account, order-tracking and missing pages, using your unsaved draft, and lists what it finds page by page. A problem shared by several pages, like the header, is listed once. Open this page shows any of them on the preview. Each page also shows a rough size of its pictures and fonts. These speed figures are estimates from the preview, not measurements of the live shop. Studio remembers your last ten checks in this browser so you can see whether things are improving. Section background pictures picked from the Media library now load a smaller copy on phones and tablets.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
