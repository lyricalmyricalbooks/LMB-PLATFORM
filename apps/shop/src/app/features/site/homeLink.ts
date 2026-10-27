/**
 * The shop name / logo in the header always opens the Home page. A plain link to "/" isn't enough: the shop
 * remembers whether the catalog was open, and a click on "/" while already there changes nothing. The logo
 * links carry this state, and MainSite returns to its first view whenever it arrives with it.
 */
export const HOME_LINK_STATE = { home: true } as const;

/** Whether a navigation came from a header logo (see HOME_LINK_STATE). */
export function wantsHome(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as { home?: unknown }).home === true;
}
