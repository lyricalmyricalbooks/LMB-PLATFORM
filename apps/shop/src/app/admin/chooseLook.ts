// Choose your look (plan 6.3): the welcome a new platform shop's owner sees the first time they open the admin, before
// the setup guide. A gallery of every theme in Studio's THEME_LIBRARY (name, mood, three swatches and a small preview
// with the press's name in the header), two or three suggested by sign-up's "What do you sell?" answer
// (`firstWeek/start` › `publishes`). Choosing applies the whole starter to Studio's draft (`applyStarter`, starterDesign.ts:
// the look, stored as the design's `themeBase`, plus its page layouts and starter pages, plan "Editable starter websites"), then records `welcome` in
// `firstWeek/start` so the welcome never shows again; Studio's theme switcher changes it later. Skip takes the first
// suggestion. A shop with no `firstWeek/start` (made before this, or by hand) and a stockroom-only plan never see it.

import { starterPhotos } from "./studio/starterPhotos";
import { applyStarter, starterForShop, starterPagesToAdd } from "./studio/starterDesign";
import { wordsFor } from "../../shared/shopSells";
// Only Choose your look loads this file, on a click (ChooseLookWelcome imports it lazily), so the section list stays out of Home.
import { getSectionMeta } from "./ThemeEditorExtensions";
import { openWorkspace, saveDraft, saveSavedThemes, ThemeConflictError } from "./themeStore";
import { applyLook } from "./studio/themeSwitch";
import { styledName } from "./studio/starterStyles";
import type { LeadSide, StarterKind } from "./studio/starterDesign";
import { currentWebsite, switchBackEntry, switchBackOffer, withSwitchBack } from "./websiteChoice";
import { withStarterWords } from "./sells";
import { adminApi } from "./api";
import { emailThemeFor } from "./lookGallery";
import type { LibraryTheme } from "./lookGallery";

// The gallery itself (suggestions, previews) lives in lookGallery.ts; it is re-exported here for the shop's own admin.
export * from "./lookGallery";

/**
 * Puts `theme` in Studio's draft the way Use this look does. If another tab saved the draft meanwhile, it reads the
 * draft again and tries once more, so nothing that tab saved is lost. Applying the same look twice gives the same draft.
 * A shop that doesn't sell books also gets its starter words (sells.ts, plan 10.1) under any words the owner wrote.
 */
export async function applyChosenLook(theme: LibraryTheme, settings: any, publishes?: string | null, extra: { logo?: File | null; kind?: StarterKind; lead?: LeadSide; keepBefore?: boolean } = {}): Promise<void> {
  const w = wordsFor(publishes);
  // The guided start's logo goes up first and into the header (brandKit's `logoUrl`). Best effort: a failed upload keeps
  // the shop name in the header, and the logo can be added in Studio › Style › Header.
  let logoUrl = "";
  if (extra.logo) {
    try { logoUrl = await (await import("./studio/mediaUpload")).uploadStudioImage(extra.logo); } catch { logoUrl = ""; }
  }
  let kept = false;
  for (let attempt = 0; ; attempt++) {
    const ws = await openWorkspace(settings);
    try {
      // Online store's Use this keeps the design as it was, so the owner can switch back for 30 days (websiteChoice.ts).
      if (extra.keepBefore && !kept) {
        await saveSavedThemes(ws, ws.savedThemes, withSwitchBack(ws.savedThemes, switchBackEntry(ws.draft, currentWebsite(ws.draft).name, styledName(theme))));
        kept = true;
      }
      const next = withStarterWords(applyStarter(ws.draft || {}, starterForShop(theme, extra.kind ?? publishes, extra.lead), getSectionMeta, w, starterPhotos(publishes)), publishes);
      await saveDraft(ws, logoUrl ? { ...next, logoUrl } : next, ws.rev);
      break;
    } catch (error) {
      if (!(error instanceof ThemeConflictError) || attempt >= 1) throw error;
    }
  }
  await addStarterPages(theme);
}

/**
 * The starter's pages, as drafts. Best effort: the look and layouts are saved already, a page whose address is taken
 * is skipped (so a second run adds none), and any page can still be made in Studio › Pages.
 */
export async function addStarterPages(theme: LibraryTheme): Promise<number> {
  let added = 0;
  try {
    for (const page of starterPagesToAdd(theme as any, await adminApi.getPages())) {
      await adminApi.createPage(page);
      added++;
    }
  } catch { /* Studio › Pages › New page offers the same starters */ }
  return added;
}

/**
 * Customer emails follow Market stall and Index rows (emailThemeFor). Best effort: the look is already saved, so a
 * failure here changes nothing else, and the email colours can still be set in Settings.
 */
export async function followEmailTheme(themeId: string): Promise<void> {
  try {
    const current = String((await adminApi.getNotificationSettings())?.brand?.emailTheme || "");
    const emailTheme = emailThemeFor(themeId, current);
    if (emailTheme && emailTheme !== current) await adminApi.setEmailTheme(emailTheme);
  } catch { /* the email colours can still be set in Settings */ }
}

/**
 * Online store › Switch back: the design from before the last website change goes back into the draft, and the design it
 * replaces is kept in its place, so switching back can itself be undone the same way. Nothing is published.
 */
export async function switchBackWebsite(settings: any): Promise<string | null> {
  const ws = await openWorkspace(settings);
  const entry = switchBackOffer(ws.savedThemes);
  if (!entry) return null;
  const now = currentWebsite(ws.draft).name;
  await saveDraft(ws, entry.design, ws.rev);
  await saveSavedThemes(ws, ws.savedThemes, withSwitchBack(ws.savedThemes, switchBackEntry(ws.draft, now, entry.from)));
  return entry.from;
}

/**
 * Online store › Bring one back: a design the owner saved before (My themes, retired 26 November 2026) goes into the
 * draft, and the design it replaces is kept for switching back. Nothing is published.
 */
export async function bringBackSaved(saved: { name: string; design: any }, settings: any): Promise<void> {
  const ws = await openWorkspace(settings);
  await saveSavedThemes(ws, ws.savedThemes, withSwitchBack(ws.savedThemes, switchBackEntry(ws.draft, currentWebsite(ws.draft).name, saved.name)));
  await saveDraft(ws, JSON.parse(JSON.stringify(saved.design ?? {})), ws.rev);
}

/** Online store › Your saved designs › Remove: the design is deleted for good (its pictures can then be deleted in Media). */
export async function removeSaved(id: string, settings: any): Promise<void> {
  const ws = await openWorkspace(settings);
  await saveSavedThemes(ws, ws.savedThemes, (ws.savedThemes || []).filter((t) => t.id !== id));
}

/** Online store › Colours: another colour version of the same starter, in the draft; layouts, words and edits stay. */
export async function applyColours(theme: LibraryTheme, settings: any): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const ws = await openWorkspace(settings);
    try { await saveDraft(ws, applyLook(ws.draft || {}, theme), ws.rev); return; }
    catch (error) { if (!(error instanceof ThemeConflictError) || attempt >= 1) throw error; }
  }
}
