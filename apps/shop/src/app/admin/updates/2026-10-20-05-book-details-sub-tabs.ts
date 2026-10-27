import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-details-sub-tabs",
  date: "2026-10-20",
  title: "Book editor: the Details tab is split into short sub tabs",
  summary: "Books › edit › Details no longer scrolls on and on. A row of sub tabs (Basics · Publishing details · Book page rows · Customs) shows one group at a time; Customs only appears for printed books. Nothing you type is lost when you switch, and the ready-to-publish checklist, save problems and “Go to Publication date” buttons open the right sub tab. A missing title, description or ISBN shows its count on the sub tab that holds it. The fields and how saving works are unchanged.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
