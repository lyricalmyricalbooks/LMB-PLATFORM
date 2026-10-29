/**
 * The app's look: Riso Press (the default) or Paper (plan step 11.3, shared with the website admin).
 *
 * The colours live in shared/admin-look/ (copied to src/styles/admin-look/). The look is chosen with
 * <html data-admin-look="paper"> (absent = Riso Press), and day or night with <body data-rp-appearance>, which
 * applyThemeToDocument() in theme.js keeps in step with <html data-theme>. <body class="rp"> switches the shared
 * tokens on. The choice is kept in this browser for now; step 11.7 saves it with the person's account so both apps agree.
 */
export const ADMIN_LOOK_STORAGE_KEY = 'lm-admin-look';
export const ADMIN_LOOKS = ['riso', 'paper'];
export const ADMIN_LOOK_LABELS = { riso: 'Riso Press', paper: 'Paper' };
export const ADMIN_LOOK_SUB_COPY = {
  riso: 'Ink outlines on cream paper',
  paper: 'Plain white paper, soft shadows',
};

export function normalizeAdminLook(value) {
  return ADMIN_LOOKS.includes(value) ? value : 'riso';
}

export function readAdminLook(storage = globalThis.localStorage) {
  try { return normalizeAdminLook(storage?.getItem(ADMIN_LOOK_STORAGE_KEY)); } catch (_) { return 'riso'; }
}

export function writeAdminLook(look, storage = globalThis.localStorage) {
  try { storage?.setItem(ADMIN_LOOK_STORAGE_KEY, normalizeAdminLook(look)); return true; } catch (_) { return false; }
}

/** Puts the look on <html>; Riso Press is the absence of the attribute, as in the website admin. */
export function applyAdminLook(look, { document: doc = globalThis.document } = {}) {
  const next = normalizeAdminLook(look);
  const root = doc?.documentElement;
  if (root) {
    if (next === 'paper') root.setAttribute('data-admin-look', 'paper');
    else root.removeAttribute('data-admin-look');
  }
  return next;
}
