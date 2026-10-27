import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-magnifier",
  date: "2026-10-22",
  title: "Optional: book photos zoom in where the mouse points",
  summary:
    "Like the “hover zoom” in Shopify themes, the main photo on a book page can now enlarge the exact spot a shopper points at with their mouse, so they can look closely at paper, print and binding without opening the full-screen viewer. The zoom follows the mouse and settles back when it leaves; dragging the photo to the next one still works, and phones and tablets are unchanged. You choose how strong it is (1.5 to 4 times). It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Photos › Zoom follows the mouse, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
