import type { AppUpdate } from "../appUpdates";

export default {
  id: "seo-author-share-image",
  date: "2026-10-12",
  title: "Google listings now name each book's photographer, and the home page shares a real picture",
  summary: "Book pages tell Google who made the book: the names in Books › edit › Author / contributors now go into the book's search data and its tab title (\"The Hound by Ian Willms — Lyricalmyrical Books\") when the book has no search title of its own and the title stays short. Group credits such as \"Various artists\" are left out. The words are in Studio › Text & labels › Site & sharing › Book page title with author. The home page's sharing and search preview no longer uses a small stock photo from the default settings: it uses Style › Logo & wordmark › Share image, else the first book's cover. The small thumbnails on book pages now carry the same photo descriptions as the main picture, so Google Images can read every photo. Search results update after Google next crawls each page.",
  links: [
    { label: "Open Books", tab: "catalog" },
    { label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=text" },
  ],
} satisfies AppUpdate;
