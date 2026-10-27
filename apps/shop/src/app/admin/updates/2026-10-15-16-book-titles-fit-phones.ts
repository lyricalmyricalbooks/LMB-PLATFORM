import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-titles-fit-phones",
  date: "2026-10-15",
  title: "Book titles fit on phones without splitting words",
  summary: "On a phone, the book page used the same title size as on a computer (49px), so long words broke in the middle (\"LYRICALMYR / ICAL\"). When no phone size is set, the title and price now scale down with the screen, and every title shrinks just enough that its longest word stays on one line, on phones and narrow laptops alike. Short titles look the same as before on computers. You can still set exact sizes in Studio › Theme settings › Product page · buy card & details › Title, price & stock.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
