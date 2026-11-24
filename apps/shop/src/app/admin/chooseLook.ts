// Choose your look (plan 6.3): the welcome a new platform shop's owner sees the first time they open the admin, before
// the setup guide. A gallery of every theme in Studio's THEME_LIBRARY (name, mood, three swatches and a small preview
// with the press's name in the header), two or three suggested by sign-up's "What do you sell?" answer
// (`firstWeek/start` › `publishes`). Choosing applies the whole starter to Studio's draft (`applyStarter`, starterDesign.ts:
// the look, stored as the design's `themeBase`, plus its page layouts and starter pages, plan "Editable starter websites"), then records `welcome` in
// `firstWeek/start` so the welcome never shows again; Studio's theme switcher changes it later. Skip takes the first
// suggestion. A shop with no `firstWeek/start` (made before this, or by hand) and a stockroom-only plan never see it.

import { starterPhotos } from "./studio/starterPhotos";
import { applyStarter, starterPagesToAdd } from "./studio/starterDesign";
import { wordsFor } from "../../shared/shopSells";
// Only Choose your look loads this file, on a click (ChooseLookWelcome imports it lazily), so the section list stays out of Home.
import { getSectionMeta } from "./ThemeEditorExtensions";
import { openWorkspace, saveDraft, ThemeConflictError } from "./themeStore";
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
export async function applyChosenLook(theme: LibraryTheme, settings: any, publishes?: string | null): Promise<void> {
  const w = wordsFor(publishes);
  for (let attempt = 0; ; attempt++) {
    const ws = await openWorkspace(settings);
    try {
      await saveDraft(ws, withStarterWords(applyStarter(ws.draft || {}, theme, getSectionMeta, w, starterPhotos(publishes)), publishes), ws.rev);
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
