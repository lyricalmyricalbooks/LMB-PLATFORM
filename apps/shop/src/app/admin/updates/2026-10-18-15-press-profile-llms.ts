import type { AppUpdate } from "../appUpdates";

export default {
  id: "press-profile-llms",
  date: "2026-10-18",
  title: "Google links every book to the press, and AI search gets a summary of the shop",
  summary: "Each book page now tells Google that Lyricalmyrical Books published and sells it, using the same name the home page gives the press, so Google can treat the books and the press as one. Books whose Publisher box names another press are left as they are. The home page also gives Google the shop's email and its town (never the street address). A new box, Studio › Text & labels › Site & sharing › Other places the shop is listed, takes links to the press's other profiles, such as Goodreads, Open Library, Wikidata or Bluesky, one per line. Google reads them together with your Instagram link. Every deploy now also publishes /llms.txt, a plain summary of the press, its books (artist, format, pages, language, ISBN) and its pages, which AI assistants and AI search can read. Nothing on the shop's pages looks different.",
  links: [{ label: "Open Text & labels", tab: "settings", settingsTab: "designer", studio: "#designer?tab=text" }, { label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
