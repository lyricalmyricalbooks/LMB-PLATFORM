// Choose your look (plan 6.3): the welcome a new platform shop's owner sees the first time they open the admin, before
// the setup guide. A gallery of every theme in Studio's THEME_LIBRARY (name, mood, three swatches and a small preview
// with the press's name in the header), two or three suggested by sign-up's "What do you sell?" answer
// (`firstWeek/start` › `publishes`). Choosing applies the theme to Studio's draft exactly as Studio › Themes › Use this
// look does (`applyLook`, which also stores the look as the design's `themeBase`), then records `welcome` in
// `firstWeek/start` so the welcome never shows again; Studio's theme switcher changes it later. Skip takes the first
// suggestion. A shop with no `firstWeek/start` (made before this, or by hand) and a stockroom-only plan never see it.

import { applyLook } from "./studio/themeSwitch";
import { openWorkspace, saveDraft, ThemeConflictError } from "./themeStore";
import { withStarterWords } from "./sells";
import type { LibraryTheme } from "./lookGallery";

// The gallery itself (suggestions, previews) lives in lookGallery.ts; it is re-exported here for the shop's own admin.
export * from "./lookGallery";

/**
 * Puts `theme` in Studio's draft the way Use this look does. If another tab saved the draft meanwhile, it reads the
 * draft again and tries once more, so nothing that tab saved is lost. Applying the same look twice gives the same draft.
 * A shop that doesn't sell books also gets its starter words (sells.ts, plan 10.1) under any words the owner wrote.
 */
export async function applyChosenLook(theme: LibraryTheme, settings: any, publishes?: string | null): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const ws = await openWorkspace(settings);
    try {
      await saveDraft(ws, withStarterWords(applyLook(ws.draft || {}, theme), publishes), ws.rev);
      return;
    } catch (error) {
      if (!(error instanceof ThemeConflictError) || attempt >= 1) throw error;
    }
  }
}
