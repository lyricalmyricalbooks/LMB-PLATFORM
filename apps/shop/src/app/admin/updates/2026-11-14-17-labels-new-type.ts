import type { AppUpdate } from "../appUpdates";

export default {
  id: "labels-new-type",
  date: "2026-11-14",
  title: "Every form now uses the new lettering",
  summary: "Field names in forms and pop-ups, like the shipping rate editor and the closing-your-shop steps, were still in the old typewriter lettering. They now match the rest of the admin, the little emoji badges on pop-ups are gone, and the shipping rate choices say products instead of books in shops that don't sell books.",
  links: [{ label: "Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
