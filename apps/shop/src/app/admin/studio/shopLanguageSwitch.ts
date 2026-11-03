// Studio › Text & labels › Shop language. Switching to French writes the French words (features/site/frenchCopy.ts)
// into the draft's Text & labels, so they go through draft and publish like any other edit, the owner can still
// change each one, and shoppers never download a second set of words. Switching back to English takes out exactly the
// words French put in; anything the owner rewrote stays.
import { FRENCH_COPY } from "../../features/site/frenchCopy";
import { DEFAULT_COPY } from "../../features/site/storeCopy";
import type { ShopLanguage } from "../../features/site/shopLanguage";

export function withShopLanguage(design: any, language: ShopLanguage): any {
  const copy: Record<string, string> = { ...(design?.copy || {}) };
  if (language === "fr") {
    for (const [key, french] of Object.entries(FRENCH_COPY)) {
      if (typeof copy[key] === "string" || !french || french === DEFAULT_COPY[key]) continue;
      copy[key] = french;
    }
    return { ...design, copy, language: "fr" };
  }
  for (const [key, french] of Object.entries(FRENCH_COPY)) {
    if (copy[key] === french && french !== DEFAULT_COPY[key]) delete copy[key];
  }
  const { language: _language, ...rest } = design || {};
  return { ...rest, copy };
}
