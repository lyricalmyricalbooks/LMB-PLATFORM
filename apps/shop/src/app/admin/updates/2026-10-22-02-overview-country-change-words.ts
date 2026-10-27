import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-country-change-words",
  date: "2026-10-22",
  title: "Overview: the country line in What changed reads in plain words",
  summary: "Today › What changed used to show the biggest move by destination as a bare code and sum, such as \"CA: −CA$290.00\". It now says \"Sales to Canada fell by CA$290.00\" (or rose). Orders that saved the country as a code (CA) and orders that saved it as a name (Canada) now count as the same destination, so the line picks the country that really moved most.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
