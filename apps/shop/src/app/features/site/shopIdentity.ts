// The shop's name, in one place (plan 1.16). Every press edits it in Studio › Text & labels › Site & sharing ›
// Site name (`siteName`); the wordmark, footer, checkout brand, copyright line, emails and the words that mention the
// press follow it through `{name}` (copy), `{{shop.name}}` (section content) or `shopName(design)` (code).
// `shopIdentity.test.ts` fails when the placeholder name is written anywhere else in the app.

/** What a new shop is called until its owner types its own name. */
export const DEFAULT_SHOP_NAME = "Your Press";

/** The shop's name as shoppers see it: Text & labels › Site & sharing › Site name, else the placeholder. */
export function shopName(design: any): string {
  const own = design?.copy?.siteName;
  return typeof own === "string" && own.trim() ? own.trim() : DEFAULT_SHOP_NAME;
}

/** The name the admin shows: Settings › General › Store name, else the site name from Studio. */
export function shopNameFromSettings(settings: any): string {
  const own = settings?.info?.name;
  return typeof own === "string" && own.trim() ? own.trim() : shopName(settings?.design);
}

/**
 * The two words of the two-part wordmark when the owner hasn't typed them: the name's first word, then the rest
 * ("Salt Hymns Press" → "Salt" + "Hymns Press"). A one-word name has no second word.
 */
export function wordmarkWords(name: string): { first: string; rest: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return { first: words[0] || "", rest: words.slice(1).join(" ") };
}
