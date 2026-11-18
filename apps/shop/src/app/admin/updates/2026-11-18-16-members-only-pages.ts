import type { AppUpdate } from "../appUpdates";

export default {
  id: "members-only-pages",
  date: "2026-11-18",
  title: "Pages only members can read (Beta)",
  summary: "In Studio › Pages, a page can now be Members only while Memberships is on. Signed-in members read it as usual. Everyone else sees its title and a box that invites them to join or sign in. The words of the page stay private to members. Add the page's link to a menu yourself, and change the box's words in Text & labels › Custom pages & 404.",
  links: [{ label: "Members", tab: "memberships" }],
} satisfies AppUpdate;
