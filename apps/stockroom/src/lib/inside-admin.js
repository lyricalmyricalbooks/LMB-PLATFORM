// The stockroom inside the combined admin (shop + stockroom plan): the rules, then startInsideAdmin, which marks the
// page so styles/inside-admin.css hides the stockroom's own menu and buttons, opens the pages the admin asks for,
// follows the admin's look and appearance, and tells the admin which page shows. Nothing runs at import time.
//
// A press with both apps uses one admin: the website admin shows the stockroom's pages in its own frame, served from
// the shop's address at /stockroom/app, so one sign-in covers both (docs/combined-admin.md). There the stockroom hides
// its own menu, top-bar buttons and phone bar, and the admin opens its pages with a message or a `#tab=<page>` link.
// Shop-only and stockroom-only presses never see any of this.
import { shopProfile } from './shop-profile.js';

/** The address the admin frames. Served by the shop's Hosting (apps/shop/firebase.json rewrite). */
export const INSIDE_ADMIN_PATH = '/stockroom/app';

/** Who sends a message: the admin to this page, or this page to the admin. Anything else is ignored. */
export const FROM_ADMIN = 'lm-admin';
export const FROM_STOCKROOM = 'lm-stockroom';
/** Fired by switchTab with the page it opens, whoever asked: a menu, a link inside a page, the book picker. */
export const STOCKROOM_PAGE_EVENT = 'lm-stockroom-page';

const PAGE = /^[a-z][a-z-]{1,29}$/;
const LOOK = /^[a-z][a-z-]{1,19}$/;

/** Both apps on: the only plan with the combined admin. */
export function combinedPlan(profile) {
  return profile?.apps?.shop === true && profile?.apps?.stockroom === true;
}

/**
 * Whether this page runs inside the combined admin: framed by a page of the same address (never another site), on the
 * plan with both apps. `win` is the window (passed in for tests).
 */
export function isInsideAdmin(win, profile) {
  if (!win || !combinedPlan(profile)) return false;
  try {
    if (win.self === win.top || !win.parent) return false;
    return win.parent.location.origin === win.location.origin;
  } catch (_) {
    // Reading another site's address throws: a frame on someone else's page is never "inside the admin".
    return false;
  }
}

/** `#tab=<page>` → the page, or null. */
export function parseTabHash(hash) {
  const m = /^#?tab=([a-z-]+)$/.exec(String(hash || ''));
  return m && PAGE.test(m[1]) ? m[1] : null;
}

/**
 * A message from the admin, checked: `{ type: 'open', tab }` or `{ type: 'look', look, appearance }`, else null.
 * Only messages from the framing page itself, on this same address, count.
 */
export function adminMessage(event, win) {
  if (!event || !win || event.source !== win.parent || event.origin !== win.location.origin) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.source !== FROM_ADMIN) return null;
  if (data.type === 'open' && PAGE.test(data.tab || '')) return { type: 'open', tab: data.tab };
  if (data.type === 'look') {
    const look = LOOK.test(data.look || '') ? data.look : null;
    const appearance = data.appearance === 'dark' || data.appearance === 'light' ? data.appearance : null;
    return look || appearance ? { type: 'look', look, appearance } : null;
  }
  return null;
}

/** A message for the admin: this page is ready, or now shows `tab`. */
export function stockroomMessage(type, extra = {}) {
  return { source: FROM_STOCKROOM, type, ...extra };
}

let _started = false;

/**
 * Start once, when this page is framed by the combined admin. `switchTab`, `setAdminLook` and `setThemePreference`
 * come from main.js. Returns whether it started.
 */
export function startInsideAdmin({ switchTab, setAdminLook, setThemePreference }, { win = window, profile = shopProfile } = {}) {
  if (_started || !isInsideAdmin(win, profile)) return false;
  _started = true;
  const doc = win.document;
  doc.documentElement.classList.add('inside-admin');

  const tell = (type, extra) => {
    try { win.parent.postMessage(stockroomMessage(type, extra), win.location.origin); } catch (_) { /* admin gone */ }
  };
  const open = (tab) => {
    try { switchTab(tab); } catch (_) { /* the page reports what it shows */ }
  };
  // Every page change, the admin's own requests included, so its menu and address never drift.
  win.addEventListener(STOCKROOM_PAGE_EVENT, (event) => {
    const tab = event && typeof event.detail === 'string' ? event.detail : '';
    if (PAGE.test(tab)) tell('page', { tab });
  });

  const fromHash = () => {
    const tab = parseTabHash(win.location.hash);
    if (!tab) return;
    try { win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`); } catch (_) { /* old browser */ }
    open(tab);
  };

  win.addEventListener('message', (event) => {
    const msg = adminMessage(event, win);
    if (!msg) return;
    if (msg.type === 'open') open(msg.tab);
    else {
      if (msg.look) setAdminLook(msg.look);
      if (msg.appearance) setThemePreference(msg.appearance, { announce: false });
    }
  });
  win.addEventListener('hashchange', fromHash);
  fromHash();
  tell('ready');
  return true;
}
