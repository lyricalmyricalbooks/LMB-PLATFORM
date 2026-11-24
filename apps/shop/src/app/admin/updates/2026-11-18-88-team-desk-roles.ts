import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-desk-roles",
  date: "2026-11-18",
  title: "Front desk and service provider roles",
  summary: "Two new team roles for shops that take bookings (Beta). Front desk signs in to a simple page with the day's bookings: they can book clients, check them in, mark no-shows and cancel. A service provider sees only their own visits and checks people in. Neither sees your money, settings or other pages.",
  links: [{ label: "Team", tab: "settings", settingsTab: "team" }, { label: "Bookings", tab: "bookings" }],
} satisfies AppUpdate;
