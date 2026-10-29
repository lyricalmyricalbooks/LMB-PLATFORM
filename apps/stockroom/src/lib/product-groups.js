// Products sold in sizes or colours (plan 10.5, 28 October 2026).
//
// The app counts stock per item, and each item keeps its own ledger (print run,
// sales, payouts). A shirt in S, M and L is three items, one per size, so every
// count, sale and payout works exactly as it does for a book. What this file
// adds is the group: items that are sizes of one product carry
// `group: { id, name }`, so the catalogue shows them together and the website
// list can offer all the sizes at once. A book (or anything without a group)
// stays a single item, as before.
//
// Pure: main.js and features/website-link.js call it; tests/product-groups.test.js
// covers it.

const clean = (value, max = 200) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);

/** The item's group, or null. A group needs an id and a name. */
export function groupOf(item) {
  const g = item && item.group;
  const id = clean(g && g.id, 120);
  const name = clean(g && g.name);
  return id && name ? { id, name } : null;
}

/**
 * The catalogue in display order: each item alone, except items of one group
 * with at least two members, which come together at the place of the first.
 * Returns [{ kind: 'single', item }] and [{ kind: 'group', id, name, items }].
 */
export function catalogGroups(items = []) {
  const counts = new Map();
  for (const item of items) {
    const g = groupOf(item);
    if (g) counts.set(g.id, (counts.get(g.id) || 0) + 1);
  }
  const out = [];
  const byId = new Map();
  for (const item of items) {
    const g = groupOf(item);
    if (!g || counts.get(g.id) < 2) { out.push({ kind: 'single', item }); continue; }
    let entry = byId.get(g.id);
    if (!entry) {
      entry = { kind: 'group', id: g.id, name: g.name, items: [] };
      byId.set(g.id, entry);
      out.push(entry);
    }
    entry.items.push(item);
  }
  return out;
}

/** The group a website edition belongs to (it names its product), or null for a book's plain edition. */
export function websiteGroup(offer) {
  const name = clean(offer && offer.product);
  const bookId = clean(offer && offer.bookId, 100);
  return name && bookId ? { id: `web-${bookId}`, name } : null;
}

/** The other offered sizes of the same website product, in the order offered. */
export function otherSizes(offer, offers = []) {
  const group = websiteGroup(offer);
  if (!group) return [];
  return offers.filter(o => o && o.key !== offer.key && websiteGroup(o)?.id === group.id);
}

const slug = (value) => clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** An item id built from `base` that no item in `taken` has: "moth-tee-m", then "moth-tee-m-2", ... */
export function freeItemId(base, taken = new Set()) {
  const root = slug(base) || 'item';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

/**
 * Another size of a saved item, made from the website's edition `offer`: the
 * saved item's settings (stock run, costs, colour, shipping, payment methods)
 * with its own id, name, price and ISBN or SKU. `taken` is the set of ids in use.
 */
export function sizeItem(saved, offer, name, taken = new Set()) {
  const id = freeItemId(`${groupOf(saved)?.name || saved.title} ${offer.edition || ''}`, taken);
  const price = Number.isFinite(offer.price) && offer.price >= 0 ? offer.price : saved.listPrice;
  // A copy, so the sizes never share a list (profit tiers, payment methods) in memory.
  const copy = JSON.parse(JSON.stringify(saved));
  // A card payment link is for one price: a size priced differently gets none until the owner adds its own.
  if (price !== saved.listPrice) copy.stripeLink = '';
  return {
    ...copy,
    id,
    title: clean(name),
    isbn: clean(offer.isbn, 40) || '—',
    listPrice: price,
    urlParam: id,
    group: groupOf(saved) || websiteGroup(offer),
  };
}
