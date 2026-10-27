import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-logo-home",
  date: "2026-10-18",
  title: "The admin logo takes you back to the Overview",
  summary: "The Lyricalmyrical name at the top of the admin menu has a cleaner all-black look, and clicking it now opens the Overview from any page (on phones it also closes the menu). If a page has unsaved changes, you're asked first, the same as with the menu links.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
