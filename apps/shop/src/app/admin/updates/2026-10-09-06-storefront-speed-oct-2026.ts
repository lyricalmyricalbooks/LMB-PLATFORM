import type { AppUpdate } from "../appUpdates";

export default {
  id: "storefront-speed-oct-2026", date: "2026-10-09", title: "Your shop opens faster, especially on phones",
  summary: "Shoppers now download about 40% less code before your shop appears (roughly 205 KB instead of 347 KB compressed). The sign-in, admin and full database tools only load when someone signs in, checks out or opens the admin, so the home page, book pages and shopping bag no longer wait for them. In our test on a slow phone connection, book covers appeared about a second sooner. Animations are smoother too: the shop grid and the Add to bag button no longer stutter, cards deep in a big catalog don't stay blank while you scroll, and the Add to bag \"Glow\" animation (Design studio › Theme settings › Product page) now actually glows. Visitors who ask their device for less motion get calmer animations. Nothing changes in checkout, payments or stock. These are local measurements; the live site gets faster once this update is deployed.",
  links: [{ label: "Preview your shop in the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
