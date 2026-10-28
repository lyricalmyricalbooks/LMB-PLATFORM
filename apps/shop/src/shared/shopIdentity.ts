// The shop's name, in one place (plan 1.16). Every press edits it in Studio › Text & labels › Site & sharing ›
// Site name (`siteName`); the wordmark, footer, checkout brand, copyright line, emails and the words that mention the
// press follow it through `{name}` (copy), `{{shop.name}}` (section content) or `shopName(design)` (code).
// `shopIdentity.test.ts` fails when the placeholder name is written anywhere else in the app.
// One copy for the shop and the server (plan 5.8): the Functions run functions/shared/shopIdentity.js, written from
// this file by scripts/build-shared.mjs, and every server email, form and report names the press through `pressName`.

/** What a new shop is called until its owner types its own name. */
export const DEFAULT_SHOP_NAME = "Your Press";

/** The shop's name as shoppers see it: Text & labels › Site & sharing › Site name, else the placeholder. */
export function shopName(design: any): string {
  const own = design?.copy?.siteName;
  return typeof own === "string" && own.trim() ? own.trim() : DEFAULT_SHOP_NAME;
}

const ownName = (value: unknown): string => {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name !== DEFAULT_SHOP_NAME ? name : "";
};

/**
 * The name the admin shows: Settings › General › Store name, else the site name from Studio. A new shop starts with
 * the placeholder as its Store name, which never hides the Site name the owner typed.
 */
export function shopNameFromSettings(settings: any): string {
  return ownName(settings?.info?.name) || shopName(settings?.design);
}

/**
 * The press's name for the server (emails, customs forms, reports): Text & labels › Site name in the published
 * design (`settings/website`), else Settings › General › Store name, else the name the shop was set up with
 * (`SHOP_SENDER_NAME`). The placeholder only when none of them is set.
 */
export function pressName(settings: any, setupName = ""): string {
  return ownName(settings?.design?.copy?.siteName) || ownName(settings?.info?.name) || ownName(setupName) || DEFAULT_SHOP_NAME;
}

/**
 * The two words of the two-part wordmark when the owner hasn't typed them: the name's first word, then the rest
 * ("Salt Hymns Press" → "Salt" + "Hymns Press"). A one-word name has no second word.
 */
export function wordmarkWords(name: string): { first: string; rest: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return { first: words[0] || "", rest: words.slice(1).join(" ") };
}
