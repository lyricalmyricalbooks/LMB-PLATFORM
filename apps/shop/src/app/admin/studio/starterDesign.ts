// Starter designs (plan "Editable starter websites", step 1, 23 November 2026). A starter is a whole website a new shop
// starts from, the way a Squarespace template or a Shopify theme is: its look (themeLook.ts), the section lists of every
// page it shapes (presetContent.ts: home, shop page, product pages…) and its starter pages. It is made only of what
// Studio edits, so the owner can change every part afterwards (themeCheck.ts `themeProblems`, run on every library
// entry by starterDesign.test.ts).
//
// Where it applies whole: the first pick of a new shop (Choose your look, chooseLook.ts) and the design-before-store
// Studio (designFirst/beforeShop.ts). The shop is new, so there is nothing of the owner's to replace. A later switch in
// Studio › Themes still changes only the look, then offers the layouts as a separate, undoable step (StudioEditor
// `applyLibraryTheme`), because by then the sections are the owner's own work.
import { applyPresetSections, presetPagesToAdd, presetSections, presetStarterPages, type StarterPhotos } from "./presetContent";
import { applyLook } from "./themeSwitch";

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
