// The old GitHub Pages address after the move to Firebase Hosting. Every page there forwards to the same page on the
// shop's address (SITE_URL): links in emails already sent (order tracking, unsubscribe, cart reminders, admin
// order links), bookmarks and search results keep working. The browser part is inlined with toString(), so the code
// these tests run is the code that ships; it stays plain ES5 and self-contained.
//
// On the way it hands over what only the old address can read, in `#lm-move=…`: the shopper's bag and wishlist (once
// per browser); on a payment return the order's private access key and the tab's checkout attempt (so a retry is still
// recognised as one: "earlier attempt already paid"); and the referring site's host name, because the forwarding page
// itself sends no referrer. The new site takes them at boot (src/app/features/site/movedState.ts) and removes them
// from the address bar.
export const OLD_BASE = '/LyricalmyricalWebsite';
export const MOVED_PREFIX = '#lm-move=';

/** The same page on the new address: drops the old folder, decodes the old 404 redirect's `?/…` form, keeps query and hash. */
export function movedUrl(href, oldBase, target) {
  var url = new URL(href);
  var path = url.pathname;
  var search = url.search;
  if (path === oldBase || path.indexOf(oldBase + '/') === 0) path = path.slice(oldBase.length) || '/';
  // The old GitHub Pages 404 redirect wrote /books/x?a=b&c as /?/books/x&a=b~and~c.
  if (search.charAt(1) === '/') {
    var parts = search.slice(1).split('&').map(function (s) { return s.replace(/~and~/g, '&'); });
    path = path.replace(/\/$/, '') + parts[0];
    search = parts[1] ? '?' + parts[1] : '';
  }
  path = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return String(target).replace(/\/+$/, '') + (path || '/') + search + url.hash;
}

/** `#lm-move=<base64url JSON>` with the old address's bag, wishlist, payment-return access and referrer, or ''. */
export function carryFragment(local, session, next, referrer) {
  try {
    var url = new URL(next);
    if (url.hash) return ''; // never replace a link's own #fragment (e.g. /admin#orders/<id>)
    var payload = { v: 1 };
    var moved = false;
    var encode = function (data) {
      return btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    if (!local.getItem('lm:moved')) {
      var cart = JSON.parse(local.getItem('fm_cart') || '[]');
      // Gift-card lines carry a recipient's name and email: those stay behind.
      cart = Array.isArray(cart) ? cart.filter(function (line) { return line && !line.giftCardDetails; }) : [];
      var wishlist = JSON.parse(local.getItem('fm_wishlist_v1') || '[]');
      if (cart.length) { payload.cart = cart; moved = true; }
      if (Array.isArray(wishlist) && wishlist.length) { payload.wishlist = wishlist; moved = true; }
    }
    var orderId = url.searchParams.get('order_id');
    if (url.pathname === '/checkout' && orderId) {
      var key = session.getItem('order-access:' + orderId);
      if (key) payload.access = { orderId: orderId, key: key };
      if (key && session.getItem('fm_last_checkout_order') === orderId) payload.access.attempt = true;
    }
    if (referrer) {
      try {
        var from = new URL(referrer).hostname;
        if (from && from !== url.hostname && !/(^|\.)github\.io$/.test(from)) payload.from = from;
      } catch (e) { /* an unreadable referrer is simply not carried */ }
    }
    if (!payload.cart && !payload.wishlist && !payload.access && !payload.from) return '';
    var encoded = encode(payload);
    if (encoded.length > 16000) {
      // A very large bag must never cost a payment return its order key: carry the small parts only.
      if (!payload.access && !payload.from) return '';
      encoded = encode({ v: 1, access: payload.access, from: payload.from });
      moved = false;
    }
    if (moved) local.setItem('lm:moved', '1');
    return '#lm-move=' + encoded;
  } catch (e) {
    return '';
  }
}

/** Runs on every old page: forward now, carrying what the new address can't read itself. */
export function forward(win, oldBase, target) {
  var next = movedUrl(win.location.href, oldBase, target);
  var carry = '';
  try { carry = carryFragment(win.localStorage, win.sessionStorage, next, win.document && win.document.referrer); } catch (e) { carry = ''; }
  win.location.replace(next + carry);
  return next + carry;
}

const json = value => JSON.stringify(String(value)).replace(/</g, '\\u003c');
const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function forwardScript(target, oldBase = OLD_BASE) {
  return `${[movedUrl, carryFragment, forward].map(fn => fn.toString()).join('\n')}\nforward(window, ${json(oldBase)}, ${json(target)});`;
}

/**
 * One forwarding page. `newUrl` set: a known old page (its canonical names the new page; without scripts it refreshes
 * there). Unset (404.html, any other old address): the script works the address out; without scripts, the new home page.
 */
export function redirectPage({ target, newUrl, oldBase = OLD_BASE }) {
  const home = String(target).replace(/\/+$/, '') + '/';
  const link = newUrl || home;
  // The refresh sits in <noscript> so it can never race the script (which keeps the #hash and the bag).
  const fallback = `${newUrl ? `<link rel="canonical" href="${escapeHtml(newUrl)}">\n` : ''}<noscript><meta http-equiv="refresh" content="0; url=${escapeHtml(link)}"></noscript>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Lyricalmyrical Books has moved</title>
<script>${forwardScript(target, oldBase)}</script>
${fallback}
</head>
<body>
<p>Lyricalmyrical Books has moved to <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>.</p>
</body>
</html>
`;
}
