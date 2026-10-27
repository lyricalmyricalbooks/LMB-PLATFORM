import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-book-fields", date: "2026-10-09", title: "Your own book details, shown automatically on book pages",
  summary: "Books now have a More details tab. Under Book fields (shared by every book) you can add your own details — for example Series, Translator, Awards or a link to a sample — and fill them in for each book. In the Design studio, any text, picture or link in a section can be connected to a detail instead of typed in: choose Connect to a detail under the field. On book pages it then shows that book's detail (its series, author, first photo…), on collection pages the open category's name, description or picture, and on your own pages the page title. So one section on the book page template works for every book. A section can also hide itself where a connected detail is empty (Visibility › Hide when a connected detail is empty). In the studio preview a missing detail shows its name in ‹ › so you can see where it goes. Removing a book field hides it but keeps the answers already saved on books. Tested with local checks only.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?tab=sections" }],
} satisfies AppUpdate;
