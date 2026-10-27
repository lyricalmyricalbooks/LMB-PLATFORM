import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-visual-widgets",
  date: "2026-10-18",
  title: "Twelve new Overview widgets, and the main ones drawn as charts",
  summary: "Edit board › Add widgets has twelve new widgets: On the site right now, Sales calendar (every day of the past year), Month goal, Sales with your notes (mark a post or fair on the sales line and see what it sold), Days to ship, Launch curves, Book of the week, Signed or not, Pre-order tracker, Order map, Gift card money owed and Sold-out countdown. Eleven existing widgets are now pictures instead of lists: Key figures have a small line under each number, Best sellers show covers and bars with the period before hatched behind, Where the money goes steps down from what customers paid to what you keep, and Format mix, Where readers are, How people find you, Shopping funnel, Busiest days and hours, Do customers come back?, Running low (days left before each book sells out) and Newest orders are redrawn the same way. Everything uses figures the Overview already loads; notes are saved privately to your account.",
  links: [{ label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
