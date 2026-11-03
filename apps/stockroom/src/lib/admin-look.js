/**
 * The app's look: Riso Press (the default) or Paper (plan step 11.3, shared with the website admin).
 *
 * The colours live in shared/admin-look/ (copied to src/styles/admin-look/). The look is chosen with
 * <html data-admin-look="paper"> (absent = Riso Press), and day or night with <body data-rp-appearance>, which
 * applyThemeToDocument() in theme.js keeps in step with <html data-theme>. <body class="rp"> switches the shared
 * tokens on. The choice is kept in this browser for now; step 11.7 saves it with the person's account so both apps agree.
 */
export const ADMIN_LOOK_STORAGE_KEY = 'lm-admin-look';
export const ADMIN_LOOKS = ['riso', 'paper', 'ledger', 'pop', 'desk', 'bento'];
export const ADMIN_LOOK_LABELS = { riso: 'Riso Press', paper: 'Paper', ledger: 'Ledger', pop: 'Pop', desk: 'Desk', bento: 'Bento' };
export const ADMIN_LOOK_SUB_COPY = {
  riso: 'Ink outlines on cream paper',
  paper: 'Plain white paper, light menu',
  ledger: 'Sage paper, serif type, thin rules',
  pop: 'Lilac paper, rounded and loud',
  desk: 'Dense working desk, icon menu',
  bento: 'Bright tiles, floating menu',
};

/** Faces each look draws with besides Riso Press's own; fetched only when the look is used. */
export const ADMIN_LOOK_FONTS = {
  riso: '',
  paper: 'family=Inter:wght@400;500;600;700',
  ledger: 'family=Source+Serif+4:wght@400;600;700',
  pop: 'family=Syne:wght@600;800&family=Inter:wght@400;500;600;700',
  desk: 'family=Manrope:wght@400;500;600;700;800',
  bento: 'family=Bricolage+Grotesque:wght@500;800&family=DM+Sans:wght@400;500;600;700',
};

function loadLookFonts(look, doc) {
  const query = ADMIN_LOOK_FONTS[look];
  if (!query || !doc?.head) return;
  const id = `admin-look-fonts-${look}`;
  if (doc.getElementById(id)) return;
  const link = doc.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  doc.head.appendChild(link);
}

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
    if (next === 'riso') root.removeAttribute('data-admin-look');
    else root.setAttribute('data-admin-look', next);
    loadLookFonts(next, doc);
  }
  return next;
}
