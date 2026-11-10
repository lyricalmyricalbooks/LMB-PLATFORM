// The admin has one look, Colophon (Julian, 10 November 2026): warm paper, white tiles, ink pill buttons, a light rail.
// Its colours live in adminThemes.css; the look is set on <html data-admin-look> so dialogs and menus drawn outside the
// admin shell follow it too. There is no choice to make, so nothing is read from or saved in the browser.
export type AdminLookId = "colophon";

export const ADMIN_LOOK: AdminLookId = "colophon";

/** Puts the look on the page (index.html and setup.html do it before the first paint; this covers the rest). */
export function applyAdminLook(): void {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-admin-look", ADMIN_LOOK);
}
