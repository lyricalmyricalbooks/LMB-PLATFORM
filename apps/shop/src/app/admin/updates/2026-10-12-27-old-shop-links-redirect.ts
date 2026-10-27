import type { AppUpdate } from "../appUpdates";

export default {
  id: "old-shop-links-redirect",
  date: "2026-10-12",
  title: "Links to the old Big Cartel shop now open the same page here",
  summary:
    "lyricalmyricalbooks.com used to show the Big Cartel shop. Now that the domain points at this shop, every old Big Cartel address forwards to its page here: each book (for example /product/the-hound-ian-willms opens The Hound), the Books and Zines categories, All products, About, Contact, Submissions, the collective photobook open call and Roots (now History of Lyricalmyrical). Any other old book or category link opens Publications. Search engines are told the move is permanent, so old search results and shared links keep working. Nothing in the admin changes.",
  links: [{ label: "Open Settings › General", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
