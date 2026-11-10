/**
 * The app's look: Colophon, the one admin look (Julian, 10 November 2026), shared with the website admin.
 *
 * The colours live in shared/admin-look/ (copied to src/styles/admin-look/). The look is <html data-admin-look="colophon">,
 * and day or night is <body data-rp-appearance>, which applyThemeToDocument() in theme.js keeps in step with
 * <html data-theme>. <body class="rp"> switches the shared tokens on. There is nothing to choose or remember.
 */
export const ADMIN_LOOK = 'colophon';

export function applyAdminLook({ document: doc = globalThis.document } = {}) {
  doc?.documentElement?.setAttribute('data-admin-look', ADMIN_LOOK);
  return ADMIN_LOOK;
}
