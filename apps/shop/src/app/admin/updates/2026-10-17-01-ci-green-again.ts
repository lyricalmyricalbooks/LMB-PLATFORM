import type { AppUpdate } from "../appUpdates";

export default {
  id: "ci-green-again",
  date: "2026-10-17",
  title: "Automatic checks are reliable again, and security updates",
  summary: "The new check that every Studio control still changes the preview was being fooled by the pulsing grey placeholder on book cards, so it recorded some bag controls as working when the test copy of the shop can't show them, and then failed on every change. It now holds such animations still while it compares, and the bag controls that need a real bag (a free-shipping rule, a pre-order, an empty bag) are listed with the reason. The site's build tools and the image resizer used for book photos were also updated to versions with known security problems fixed. Nothing shoppers see changes.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
