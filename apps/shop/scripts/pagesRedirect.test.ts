import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { carryFragment, forwardScript, movedUrl, redirectPage, OLD_BASE } from './pagesRedirect.mjs';

const target = 'https://lmb-test-shop.web.app';
const old = 'https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite';
const store = (data: Record<string, string> = {}) => ({
  data, getItem: (k: string) => (k in data ? data[k] : null), setItem: (k: string, v: string) => { data[k] = String(v); },
});
const decode = (fragment: string) => JSON.parse(Buffer.from(fragment.replace('#lm-move=', ''), 'base64url').toString('utf8'));

describe('old GitHub Pages links land on the same page of the shop', () => {
  it.each([
    [`${old}/`, `${target}/`],
    [old, `${target}/`],
    [`${old}/books/cream-show`, `${target}/books/cream-show`],
    [`${old}/books/cream-show/`, `${target}/books/cream-show`],
    [`${old}/books/cream-show.html`, `${target}/books/cream-show`],
    [`${old}/index.html`, `${target}/`],
    // Links already in customers' inboxes:
    [`${old}/track?orderId=AB12&key=${'a'.repeat(64)}`, `${target}/track?orderId=AB12&key=${'a'.repeat(64)}`],
    [`${old}/track?unsubscribe=1&email=x%40y.com&sig=s`, `${target}/track?unsubscribe=1&email=x%40y.com&sig=s`],
    [`${old}/checkout?cartId=c1`, `${target}/checkout?cartId=c1`],
    [`${old}/admin#orders/AB12`, `${target}/admin#orders/AB12`],
    // Bookmarked addresses from the old 404 redirect:
    [`${old}/?/books/x&a=b~and~c`, `${target}/books/x?a=b&c`],
    [`${old}/?/page/about`, `${target}/page/about`],
  ])('%s → %s', (from, to) => {
    expect(movedUrl(from, OLD_BASE, target)).toBe(to);
  });
});

describe('what the old address hands over', () => {
  const line = { id: 'b1', title: 'Cream Show', price: 25, quantity: 2, photoUrl: '' };

  it('carries the bag and wishlist once per browser, never gift-card recipients', () => {
    const local = store({ fm_cart: JSON.stringify([line, { ...line, id: 'g', giftCardDetails: { recipientEmail: 'friend@example.com' } }]), fm_wishlist_v1: '["b2"]' });
    const fragment = carryFragment(local, store(), `${target}/books/x`);
    expect(decode(fragment)).toEqual({ v: 1, cart: [line], wishlist: ['b2'] });
    expect(fragment).not.toContain('friend');
    expect(carryFragment(local, store(), `${target}/`)).toBe('');
  });

  it("hands over a payment return's order key so the confirmation can open", () => {
    const key = 'f'.repeat(64);
    const fragment = carryFragment(store({ 'lm:moved': '1' }), store({ 'order-access:AB12': key }), `${target}/checkout?success=true&order_id=AB12`);
    expect(decode(fragment)).toEqual({ v: 1, access: { orderId: 'AB12', key } });
    expect(carryFragment(store({ 'lm:moved': '1' }), store({ 'order-access:AB12': key }), `${target}/track?order_id=AB12`)).toBe('');
  });

  it('leaves a link with its own #fragment alone, and gives up quietly on broken storage', () => {
    expect(carryFragment(store({ fm_cart: JSON.stringify([line]) }), store(), `${target}/admin#orders/AB12`)).toBe('');
    expect(carryFragment(store({ fm_cart: '{not json' }), store(), `${target}/`)).toBe('');
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(carryFragment(throwing, throwing, `${target}/`)).toBe('');
  });

  it('carries nothing when there is nothing to carry', () => {
    expect(carryFragment(store(), store(), `${target}/`)).toBe('');
  });

  it("marks a payment return that was this tab's checkout attempt, so a retry is still refused if it was paid", () => {
    const key = 'e'.repeat(64);
    const session = store({ 'order-access:AB12': key, fm_last_checkout_order: 'AB12' });
    expect(decode(carryFragment(store({ 'lm:moved': '1' }), session, `${target}/checkout?paypal_return=true&order_id=AB12`)).access)
      .toEqual({ orderId: 'AB12', key, attempt: true });
  });

  it('never lets a very large bag cost a payment return its order key', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ ...line, id: `book-${i}`, title: 'A long title '.repeat(8) }));
    const local = store({ fm_cart: JSON.stringify(big) });
    const fragment = carryFragment(local, store({ 'order-access:AB12': 'f'.repeat(64) }), `${target}/checkout?order_id=AB12`);
    expect(decode(fragment)).toEqual({ v: 1, access: { orderId: 'AB12', key: 'f'.repeat(64) } });
    expect(local.data['lm:moved']).toBeUndefined(); // the bag can still come along on a later visit
  });

  it('passes on where the visit came from (the forwarding page itself sends no referrer)', () => {
    expect(decode(carryFragment(store(), store(), `${target}/books/x`, 'https://l.instagram.com/?u=x'))).toEqual({ v: 1, from: 'l.instagram.com' });
    expect(carryFragment(store(), store(), `${target}/`, 'https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite/')).toBe('');
    expect(carryFragment(store(), store(), `${target}/`, 'not a url')).toBe('');
  });
});

describe('the forwarding pages', () => {
  const run = (href: string, local = store(), session = store()) => {
    const calls: string[] = [];
    const url = new URL(href);
    const location = { href, pathname: url.pathname, search: url.search, hash: url.hash, replace: (to: string) => calls.push(to) };
    vm.runInNewContext(forwardScript(target), { window: { location, localStorage: local, sessionStorage: session, document: { referrer: '' } }, URL, JSON, btoa, unescape, encodeURIComponent });
    return calls;
  };

  it('forwards as soon as the page loads, with the bag', () => {
    expect(run(`${old}/books/cream-show`)).toEqual([`${target}/books/cream-show`]);
    const [to] = run(`${old}/`, store({ fm_cart: JSON.stringify([{ id: 'b1', price: 1, quantity: 1 }]) }));
    expect(to.startsWith(`${target}/#lm-move=`)).toBe(true);
  });

  it('names the new page for search engines and no-JS visitors without racing the script', () => {
    const html = redirectPage({ target, newUrl: `${target}/books/cream-show` });
    expect(html).toContain(`<link rel="canonical" href="${target}/books/cream-show">`);
    expect(html).toMatch(/<noscript><meta http-equiv="refresh" content="0; url=https:\/\/lmb-test-shop\.web\.app\/books\/cream-show"><\/noscript>/);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<noscript>'));
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });

  it('the catch-all 404 page has no canonical and falls back to the home page', () => {
    const html = redirectPage({ target });
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain(`url=${target}/"`);
  });

  it('escapes addresses', () => {
    const html = redirectPage({ target, newUrl: `${target}/books/a"b<c>&d` });
    expect(html).toContain('a&quot;b&lt;c&gt;&amp;d');
    expect(html).not.toContain('a"b<c>');
  });
});
