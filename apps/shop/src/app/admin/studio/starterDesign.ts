// Starter designs (plan "Editable starter websites", step 1, 23 November 2026). A starter is a whole website a new shop
// starts from, the way a Squarespace template or a Shopify theme is: its look (themeLook.ts), the section lists of every
// page it shapes (presetContent.ts: home, shop page, product pages…) and its starter pages. It is made only of what
// Studio edits, so the owner can change every part afterwards (themeCheck.ts `themeProblems`, run on every library
// entry by starterDesign.test.ts).
//
// Where it applies whole: the first pick of a new shop (Choose your look, chooseLook.ts) and the design-before-store
// Studio (designFirst/beforeShop.ts). The shop is new, so there is nothing of the owner's to replace. A later switch in
// Studio › Designs still changes only the look, then offers the layouts as a separate, undoable step (StudioEditor
// `applyLibraryTheme`), because by then the sections are the owner's own work.
import { applyPresetSections, presetPagesToAdd, presetSections, presetStarterPages, type StarterPhotos } from "./presetContent";
import { applyLook } from "./themeSwitch";
import { shopKind } from "../../../shared/shopSells";

/** Section metadata lookup (ThemeEditorExtensions `getSectionMeta`), passed in so this file stays pure. */
export type SectionMetaLookup = (type: string) => any;

/**
 * The whole starter on `design`: its look, then its section lists in place of those pages' sections, in the shop's own
 * words (`w`, shared/shopSells `wordsFor`). Pages without a section list in the starter keep theirs. Pure: the same
 * design and starter always give the same result, so applying a starter twice is the same as once.
 */
export function applyStarter(design: any, theme: any, meta: SectionMetaLookup, w: (text: string) => string = (t) => t, samples?: StarterPhotos): any {
  return applyPresetSections(applyLook(design || {}, theme), theme, meta, w, samples);
}

/** What a starter sets up, for the picker card and the control room: page names and starter page titles. */
export function starterContents(theme: any): { pages: string[]; starterPages: string[] } {
  return {
    pages: Object.keys(presetSections(theme)),
    starterPages: presetStarterPages(theme).map((s) => s.title),
  };
}

/** The starter pages to add to a shop that has `pages`, as drafts (an address already in use is skipped). */
export const starterPagesToAdd = presetPagesToAdd;

/** Sections that show products: a services shop's version of a starter replaces them (`starterForShop`). */
export const PRODUCT_SECTIONS = new Set([
  "CollectionListSection", "FeaturedProductSection", "ProductGridHeaderSection", "ProductCoverCarouselSection",
  "ProductShowcaseGridSection", "StaffNotesTableSection", "FeaturedCollectionSection", "BookSpotlightSection",
  "EphemeraRowSection", "StickyAddToBagSection",
]);

/** Sections that book appointments or classes: a product shop's version of a services starter replaces them. */
export const SERVICE_SECTIONS = new Set(["ServiceMenuSection", "BookTimeSection", "BookingTeamSection", "BookingHoursSection"]);

/**
 * A product or books shop's version of a starter made for appointments or classes (Salon, Workshop; round three,
 * 25 November 2026): the first price list or Book a time row becomes the product grid, keeping its eyebrow and title,
 * and the other booking rows (team, hours, a second booking row) are dropped; a button to Book a time goes to the shop.
 * A starter with none comes back unchanged.
 */
/** A button that sent shoppers to Book a time sends them to the shop instead (a product shop has no bookings). */
const toShop = (section: any) => (section?.settings?.ctaUrl === "/book"
  ? { ...section, settings: { ...section.settings, ctaText: "See the collection", ctaUrl: "/collections/all" } }
  : section);
function goodsVersion<T>(theme: T): T {
  const all = presetSections(theme as any);
  if (!Object.values(all).some((list) => list.some((s) => SERVICE_SECTIONS.has(s.type)))) return theme;
  const sections: Record<string, unknown[]> = {};
  for (const [id, list] of Object.entries(all)) {
    let swapped = false;
    const next: any[] = [];
    for (const section of list) {
      if (!SERVICE_SECTIONS.has(section.type)) { next.push(toShop(section)); continue; }
      if (!swapped && (section.type === "ServiceMenuSection" || section.type === "BookTimeSection")) {
        const { eyebrow, title } = (section.settings || {}) as Record<string, unknown>;
        next.push({ type: "ProductShowcaseGridSection", settings: { ...(eyebrow ? { eyebrow } : {}), ...(title ? { title } : {}) } });
        swapped = true;
      }
    }
    sections[id] = next;
  }
  const t = theme as any;
  return { ...t, content: { ...(t.content || {}), sections } } as T;
}

/**
 * The starter as a shop that sells `sells` gets it (24 November 2026, rethink "service shops"): one design serves every
 * kind of shop. A services shop's version swaps the first product row for the price list (ServiceMenuSection), the
 * second for the Book a time cards (BookTimeSection), drops any other product row and adds opening hours before the
 * sign-up band (or at the end). Every other part of the design is kept. Product and books shops get the starter as is,
 * unless it was made for appointments or classes (`goodsVersion`).
 */
export function starterForShop<T>(theme: T, sells?: string | null): T {
  if (!theme) return theme;
  if (shopKind(sells) !== "services") return goodsVersion(theme);
  const sections: Record<string, unknown[]> = {};
  for (const [id, list] of Object.entries(presetSections(theme as any))) {
    let swapped = 0;
    const next: any[] = [];
    for (const section of list) {
      if (!PRODUCT_SECTIONS.has(section.type)) { next.push(section); continue; }
      if (swapped === 0) next.push({ type: "ServiceMenuSection" });
      else if (swapped === 1) next.push({ type: "BookTimeSection" });
      swapped++;
    }
    if (swapped && !next.some((s) => s.type === "BookingHoursSection")) {
      const signUp = next.findIndex((s) => s.type === "NewsletterSection");
      next.splice(signUp < 0 ? next.length : signUp, 0, { type: "BookingHoursSection" });
    }
    sections[id] = next;
  }
  const t = theme as any;
  return { ...t, content: { ...(t.content || {}), sections } } as T;
}
