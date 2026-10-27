// Books › edit › Details is split into sub tabs. Pure rules for which sub tabs show and which one holds a field.
// Ids carry a `bd-` prefix because Riso Tabs render `id="rp-tab-<id>"` and the editor's own tabs use plain ids.

export type DetailsSubTab = "bd-basics" | "bd-publishing" | "bd-rows" | "bd-customs";

/** The sub tab holding each field something else in the editor points at (checklist, save problems, "Go to …" buttons). */
export const DETAILS_FIELD_TAB: Record<string, DetailsSubTab> = {
  title: "bd-basics",
  description: "bd-basics",
  slug: "bd-basics",
  isbn: "bd-publishing",
  sku: "bd-publishing",
  publishDate: "bd-publishing",
  weight: "bd-publishing",
  customsDescription: "bd-customs",
  hsTariffNumber: "bd-customs",
};

/** Customs only matter for printed products (no gift cards, no e-books/audiobooks), as before. */
export function detailsSubTabs({ customs, issues = {} }: { customs: boolean; issues?: Partial<Record<DetailsSubTab, number>> }) {
  const tabs: Array<{ id: DetailsSubTab; label: string; count?: number }> = [
    { id: "bd-basics", label: "Basics", count: issues["bd-basics"] || undefined },
    { id: "bd-publishing", label: "Publishing details", count: issues["bd-publishing"] || undefined },
    { id: "bd-rows", label: "Book page rows", count: issues["bd-rows"] || undefined },
  ];
  if (customs) tabs.push({ id: "bd-customs", label: "Customs", count: issues["bd-customs"] || undefined });
  return tabs;
}

/** A sub tab that no longer shows (e.g. Customs after switching to an e-book) falls back to Basics. */
export function shownDetailsSubTab(chosen: DetailsSubTab, tabs: Array<{ id: DetailsSubTab }>): DetailsSubTab {
  return tabs.some((t) => t.id === chosen) ? chosen : "bd-basics";
}
