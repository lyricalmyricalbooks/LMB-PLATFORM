// Google Merchant Center product feed (Google Shopping / free product listings).
// Pure ESM so the build (scripts/generate-sitemap.mjs → dist/google-merchant-feed.xml) and the
// admin's Books › Google Shopping feed panel use the same rules. Prices, sale windows, pre-orders
// and stock follow the server's checkout rules (functions/catalogPrice.js, shared/promotions.js,
// src/shared/preorder.ts) — merchantFeed.parity.test.ts keeps them identical, because Google refuses items
// whose feed price or availability differ from what the product page and checkout show.
import { resolveProductRoutes } from './productRouteData.mjs';

export const FEED_FILE = 'google-merchant-feed.xml';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const shopDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** "-04:00" / "-05:00": Toronto's UTC offset on that calendar day. */
function torontoOffset(day) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${day}T12:00:00Z`)).find(part => part.type === 'timeZoneName')?.value || 'GMT-5';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}` : '-05:00';
}

/** Same rule as liveBook.ts / scripts/publicStorefrontData.mjs releaseArrived. */
export function releaseArrived(scheduleDate, now = new Date()) {
  if (!scheduleDate) return true;
  const value = String(scheduleDate);
  if (DATE_ONLY.test(value)) return value <= shopDate(now);
  const at = Date.parse(value);
  return Number.isFinite(at) ? at <= now.getTime() : value <= now.toISOString();
}

export const isLive = (book, now) => (!book.status || book.status === 'published') && releaseArrived(book.scheduleDate, now);

export function saleActive(book, now) {
  if (!book?.isOnSale || !(Number(book.salePrice) > 0)) return false;
  const today = shopDate(now);
  const start = String(book.saleStartsAt || '').slice(0, 10);
  const end = String(book.saleEndsAt || '').slice(0, 10);
  return !(DATE_ONLY.test(start) && start > today) && !(DATE_ONLY.test(end) && end < today);
}

/** functions/catalogPrice.js catalogUnitPrice: NaN = not for sale. */
export function unitPrice(book, variant, now = new Date()) {
  if (variant) return variant.price === undefined || variant.price === null || variant.price === '' ? NaN : Number(variant.price);
  return saleActive(book, now) ? Number(book.salePrice) : Number(book?.retailPrice);
}

export function preorderDate(book, now = new Date()) {
  if (!book || book.preorder !== true) return null;
  const date = String(book.publishDate || '').slice(0, 10);
  if (!DATE_ONLY.test(date)) return '';
  return date > shopDate(now) ? date : null;
}

function bundleParts(book) {
  if (!Array.isArray(book?.bundleItems)) return [];
  return book.bundleItems.filter(p => p && typeof p.bookId === 'string' && p.bookId).slice(0, 20)
    .map(p => ({ id: p.bookId, variantId: typeof p.variantId === 'string' && p.variantId ? p.variantId : null, quantity: Math.max(1, Math.min(20, Math.floor(Number(p.quantity) || 1))) }));
}

/** Copies available to sell: Infinity when stock isn't tracked or backorders are allowed (shared promotions partStock). */
export function stockOf(book, variantId) {
  if (!book) return 0;
  if (book.trackInventory !== true || book.allowBackorder === true) return Infinity;
  if (variantId) {
    const v = (book.variants || []).find(x => x && x.id === variantId);
    if (v?.allowBackorder) return Infinity;
    return v ? Math.max(0, Number(v.stock ?? v.stockLevel) || 0) : 0;
  }
  return Math.max(0, Number(book.stockLevel) || 0);
}

export function bundleStock(book, getBook) {
  let sets = Infinity;
  for (const part of bundleParts(book)) sets = Math.min(sets, Math.floor(stockOf(getBook(part.id), part.variantId) / part.quantity));
  return sets;
}

/** A valid ISBN-13 without hyphens (lib/bookSeo.ts isbn13), or ''. */
export function isbn13(value) {
  const d = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(d)) return '';
  const sum = [...d.slice(0, 12)].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]) ? d : '';
}

export const plain = value => String(value ?? '')
  .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

export const cut = (text, max) => (text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…');

const httpsUrl = (value, base) => {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('data:')) return '';
  try { const url = new URL(value.trim(), base); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
};

// Same rule as lib/bookSeo.ts bookCreators (merchantFeed.test.ts checks they agree): the people in the editor's
// "Author / contributors" box (else the legacy authorName); group credits like "Various artists" name nobody.
const GROUP_CREDIT = /^(various|vari[eo]?\b|aa\.?\s*vv\.?|autori vari|artisti vari|multiple|anthology)|\s[x×]\s/i;
export function creatorNames(book) {
  const credit = plain(book?.subtitle).replace(/\s+/g, ' ') || plain(book?.authorName).replace(/\s+/g, ' ');
  if (!credit || GROUP_CREDIT.test(credit)) return [];
  return [...new Set(credit.split(/\s*(?:,|;|&|\s\+\s|\sand\s)\s*/i).map(name => name.trim()).filter(name => name.length > 1))].slice(0, 10);
}

/** Shopping matches searches on the title, so a book's listing says who made it: "The Hound by Ian Willms". */
function titleWithCreators(title, names) {
  if (!names.length || title.toLowerCase().includes(names[0].toLowerCase())) return title;
  return `${title} by ${names.join(', ')}`;
}

function googleCategory(format) {
  const f = String(format || '').toLowerCase();
  if (/audio/.test(f)) return 'Media > Books > Audiobooks';
  if (/e-?book|epub|digital|pdf|kindle/.test(f)) return 'Media > Books > E-books';
  return 'Media > Books > Print Books';
}

const money = n => `${n.toFixed(2)} CAD`;

/**
 * The feed's items, plus the published books left out and why (shown in the admin panel).
 * `books` = the whole catalog; only books shoppers can buy today are listed.
 */
export function merchantFeedItems(siteUrl, books, { shopName = 'Lyricalmyrical Books', now = new Date() } = {}) {
  const base = siteUrl.replace(/\/$/, '');
  const byId = new Map(books.map(b => [b.id, b]));
  const live = books.filter(b => isLive(b, now));
  const items = [];
  const skipped = [];
  for (const book of resolveProductRoutes(live)) {
    const title = String(book.title || '').trim() || 'Untitled';
    const creators = creatorNames(book);
    if (book.productType === 'giftCard') continue;
    if (book.seoNoindex === true) { skipped.push({ id: book.id, title, reason: 'Hidden from search engines (Search (SEO) › Hide from search)' }); continue; }
    const link = `${base}/books/${encodeURIComponent(book.slug)}`;
    const photos = [...new Set((Array.isArray(book.photos) ? book.photos : []).map(p => httpsUrl(p?.url, base + '/')).filter(Boolean))];
    if (!photos.length && book.photoUrl) { const u = httpsUrl(book.photoUrl, base + '/'); if (u) photos.push(u); }
    const description = cut(plain(book.metaDescription) || plain(book.description) || `${title}${book.subtitle ? ` by ${plain(book.subtitle)}` : ''}`, 5000);
    const pre = preorderDate(book, now);
    const bundle = bundleParts(book).length > 0;
    const common = {
      description, link, brand: plain(book.publisher) || shopName, condition: 'new',
      googleCategory: googleCategory(book.format), productType: (book.categories || book.genres || [])[0] || '',
      bundle, creators,
    };
    const variants = Array.isArray(book.variants) ? book.variants.filter(v => v && v.id) : [];
    const editions = variants.length ? variants : [null];
    for (const variant of editions) {
      const listed = titleWithCreators(title, creators);
      const name = variant ? `${listed} – ${String(variant.name || '').trim() || 'Edition'}` : listed;
      const price = unitPrice(book, variant, now);
      const image = (variant && httpsUrl(variant.photoUrl, base + '/')) || photos[0] || '';
      if (!(price > 0)) { skipped.push({ id: book.id, title: name, reason: variant ? 'This edition has no price' : 'No price' }); continue; }
      if (!image) { skipped.push({ id: book.id, title: name, reason: 'No photo (Google requires one)' }); continue; }
      const stock = bundle ? bundleStock(book, id => byId.get(id)) : stockOf(book, variant?.id);
      const tracked = book.trackInventory === true;
      const availability = pre !== null ? 'preorder'
        : stock > 0 ? (tracked && book.allowBackorder === true && !(Number(variant ? (variant.stock ?? variant.stockLevel) : book.stockLevel) > 0) ? 'backorder' : 'in_stock')
        : 'out_of_stock';
      const item = {
        ...common,
        id: variant ? `${book.id}_${variant.id}`.slice(0, 50) : String(book.id).slice(0, 50),
        groupId: variant ? String(book.id).slice(0, 50) : '',
        title: cut(name, 150),
        image,
        additionalImages: photos.filter(p => p !== image).slice(0, 10),
        price: money(variant ? price : Number(book.retailPrice) > price ? Number(book.retailPrice) : price),
        salePrice: '',
        saleDates: '',
        availability,
        availabilityDate: pre ? `${pre}T00:00${torontoOffset(pre)}` : '',
        gtin: isbn13(variant?.isbn) || isbn13(book.isbn),
      };
      if (!variant && saleActive(book, now) && Number(book.retailPrice) > price) {
        item.salePrice = money(price);
        const start = String(book.saleStartsAt || '').slice(0, 10);
        const end = String(book.saleEndsAt || '').slice(0, 10);
        if (DATE_ONLY.test(end)) {
          const from = DATE_ONLY.test(start) ? start : shopDate(now);
          item.saleDates = `${from}T00:00${torontoOffset(from)}/${end}T23:59${torontoOffset(end)}`;
        }
      }
      items.push(item);
    }
  }
  return { items, skipped };
}

// XML 1.0 forbids most control characters; a stray one in a description would break the whole feed.
const xml = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function merchantFeedXml(siteUrl, items, { shopName = 'Lyricalmyrical Books' } = {}) {
  const tag = (name, value) => (value === '' || value === undefined || value === null ? '' : `\n      <${name}>${xml(value)}</${name}>`);
  const body = items.map(item => '    <item>'
    + tag('g:id', item.id) + tag('g:item_group_id', item.groupId) + tag('title', item.title) + tag('description', item.description)
    + tag('link', item.link) + tag('g:image_link', item.image) + item.additionalImages.map(u => tag('g:additional_image_link', u)).join('')
    + tag('g:availability', item.availability) + tag('g:availability_date', item.availabilityDate)
    + tag('g:price', item.price) + tag('g:sale_price', item.salePrice) + tag('g:sale_price_effective_date', item.saleDates)
    + tag('g:brand', item.brand) + (item.gtin ? tag('g:gtin', item.gtin) : tag('g:identifier_exists', 'no'))
    + tag('g:condition', item.condition) + tag('g:google_product_category', item.googleCategory) + tag('g:product_type', item.productType)
    + (item.bundle ? tag('g:is_bundle', 'yes') : '')
    + (item.creators || []).map(person => `\n      <g:product_detail><g:section_name>Book</g:section_name><g:attribute_name>Author</g:attribute_name><g:attribute_value>${xml(person)}</g:attribute_value></g:product_detail>`).join('')
    + '\n    </item>').join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${xml(shopName)}</title>\n    <link>${xml(siteUrl.replace(/\/$/, '') + '/')}</link>\n    <description>${xml(`${shopName} books`)}</description>\n${body}${body ? '\n' : ''}  </channel>\n</rss>\n`;
}
