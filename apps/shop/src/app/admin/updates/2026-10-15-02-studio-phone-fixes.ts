import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-phone-fixes",
  date: "2026-10-15",
  title: "Phone header fits, and Studio's phone preview is easier to edit",
  summary: "On phones, a long shop name in the header could push the bag and its total off the right edge of the screen; the bag now moves onto its own line under the name when there isn't room (computers are unchanged). In Studio's phone preview, the toolbar for the selected section is now one row you can swipe sideways instead of three rows covering the page. Drop-downs in Studio that you haven't set (for example a Multicolumn section's Alignment) now say \"Default (not set)\" instead of showing their first choice, which wasn't what the shop showed and couldn't be picked.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
