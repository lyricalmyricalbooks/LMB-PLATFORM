// Style › Cart drawer › Total & checkout button › Tab reminder (off by default). While a shopper with books
// in the bag is on another browser tab, the shop's tab title says so; it goes back the moment they return.
// Pure rules here; the hook is in CartDrawer (mounted on every storefront page).

/** True when the owner switched the reminder on. */
export const tabReminderOn = (design: any): boolean => design?.cartTabReminder === true;

/** Never on the admin, the Studio preview or with an empty bag. */
export function tabReminderApplies(on: boolean, itemCount: number, path: string, preview: boolean): boolean {
  if (!on || preview || !(itemCount > 0)) return false;
  return !/^\/admin(\/|$)/.test(path);
}

/** The words to show, one line, trimmed (blank words = no reminder). */
export function tabReminderTitle(words: string): string {
  return String(words || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Put the page's own title back only when nothing else changed it while the shopper was away
 * (a page that set a new title keeps it).
 */
export function titleToRestore(current: string, reminder: string, saved: string): string | null {
  return current === reminder ? saved : null;
}
